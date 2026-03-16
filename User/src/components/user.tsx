import { useEffect, useState, useRef } from "react";
import socket from "../socket";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import L from "leaflet";

type Location = {
  lat: number;
  lng: number;
};

const FALLBACK_USER: Location = {
  lat: 12.868342,
  lng: 77.654714,
};

const FALLBACK_DEST: Location = {
  lat: 12.842639,
  lng: 77.675179,
};

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

const createCustomIcon = (color: string) =>
  L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 30px;
        height: 40px;
        border-radius: 50% 50% 50% 0%;
        transform: rotate(-45deg);
        box-shadow: 0 0 0 2px white;
        display:flex;
        align-items:center;
        justify-content:center;
      ">
        <span style="transform: rotate(45deg);">📍</span>
      </div>
    `,
    iconSize: [30, 40],
    className: "custom-marker",
  });

const userIcon = createCustomIcon("#3b82f6");
const ambulanceIcon = createCustomIcon("#ef4444");

function MapUpdater({ center }: { center: Location }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center, map]);
  return null;
}

export default function User() {
  const [userLoc, setUserLoc] = useState<Location>(FALLBACK_USER);
  const [destLoc, setDestLoc] = useState<Location>(FALLBACK_DEST);
  const [ambulanceLoc, setAmbulanceLoc] = useState<Location>(FALLBACK_DEST);
  const [ambulanceVisible, setAmbulanceVisible] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [distance, setDistance] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [ambulanceCrossed, setAmbulanceCrossed] = useState(false);
  const [emergencyId, setEmergencyId] = useState<string | null>(null);
  const [emergencyStatus, setEmergencyStatus] = useState<
    "idle" | "requesting" | "active" | "canceling" | "failed"
  >("idle");
  const [emergencyError, setEmergencyError] = useState<string | null>(null);

  const ambulanceRef = useRef(ambulanceLoc);

  // Keep latest ambulance location reference
  useEffect(() => {
    ambulanceRef.current = ambulanceLoc;
  }, [ambulanceLoc]);

  // Distance calculator (km)
  const calculateDistance = (a: Location, b: Location) => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((a.lat * Math.PI) / 180) *
        Math.cos((b.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
  };

  // Smooth ambulance animation
  const animateAmbulance = (start: Location, end: Location) => {
    const startTime = performance.now();
    const duration = 300;

    const animate = (time: number) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 2);

      const lat = start.lat + (end.lat - start.lat) * eased;
      const lng = start.lng + (end.lng - start.lng) * eased;

      const newLoc = { lat, lng };
      setAmbulanceLoc(newLoc);

      const dist = calculateDistance(userLoc, newLoc);
      setDistance(dist);

      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  };
  useEffect(() => {
    fetch(`${BACKEND_URL}/simulate/user/start`, {
      method: "POST",
    })
      .then(res => res.json())
      .then(data => console.log("User simulation started:", data))
      .catch(err => console.error("Failed to start user simulation", err));
  }, []);

  const requestEmergency = async () => {
    setEmergencyStatus("requesting");
    setEmergencyError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/emergency/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userLat: userLoc.lat,
          userLng: userLoc.lng,
          destination: {
            lat: destLoc.lat,
            lng: destLoc.lng,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Emergency request failed (${response.status})`);
      }

      const data = await response.json();
      setEmergencyId(data.emergencyId);
      setEmergencyStatus("active");
    } catch (error) {
      console.error("Failed to request emergency:", error);
      setEmergencyStatus("failed");
      setEmergencyError("Unable to send request. Please try again.");
    }
  };

  const cancelEmergency = async () => {
    if (!emergencyId) return;
    setEmergencyStatus("canceling");
    setEmergencyError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/emergency/cancel/${emergencyId}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Emergency cancel failed (${response.status})`);
      }

      setEmergencyId(null);
      setEmergencyStatus("idle");
    } catch (error) {
      console.error("Failed to cancel emergency:", error);
      setEmergencyStatus("failed");
      setEmergencyError("Unable to cancel request. Please try again.");
    }
  };

  // 🔥 SINGLE CLEAN SOCKET USE EFFECT
  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected:", socket.id);
    });

    // 🚑 Show ambulance ONLY when backend says within 1km
    socket.on("ambulanceNearby", (data: any) => {
      setAmbulanceVisible(true);
      setStatus("🚨 Ambulance is 1km away! Clear a path!");
      setShowPopup(true);
      
      // Auto-hide popup after 5 seconds
      setTimeout(() => {
        setShowPopup(false);
      }, 5000);
    });

    // User paused when ambulance is couple of meters away
    socket.on("userPaused", (data: any) => {
      setIsPaused(true);
      setStatus("🚨 CLEAR THE WAY! Ambulance passing!");
      console.log("User paused:", data.message);
    });

    // User resumed after ambulance passes (clears the pause)
    socket.on("userResumed", (data: any) => {
      setIsPaused(false);
      setStatus("✅ Ambulance passed. Safe to continue.");
      console.log("User resumed:", data.message);
    });

    // Ambulance crossed user - safely passed
    socket.on("ambulanceCrossed", (data: any) => {
      setAmbulanceCrossed(true);
      setAmbulanceVisible(false); // Hide immediately after crossing
      setShowPopup(false);
      setStatus("✅ Ambulance safely passed. Continue on your route.");
      console.log("Ambulance crossed:", data.message);
    });

    // Live updates - keep showing ambulance until 1.5km away
    socket.on("ambulanceUpdate", (data: Location) => {
      if (!ambulanceVisible) return;
      
      // Calculate distance to ambulance
      const dist = calculateDistance(userLoc, data);
      setDistance(dist);
      
      // Hide ambulance only when it's 1.5km+ away after crossing
      if (ambulanceCrossed && dist >= 1500) {
        setAmbulanceVisible(false);
        setStatus("✅ Ambulance far away. Safe to continue.");
        return;
      }
      
      // Only animate if not paused and still visible
      if (!isPaused) {
        animateAmbulance(ambulanceRef.current, data);
      }
    });

    // User always moves (but respects pause state)
    socket.on("userLocationUpdate", (data: Location) => {
  console.log("USER RECEIVED LOCATION:", data, "Paused:", isPaused);
  
  // Only update user location if not paused
  if (!isPaused) {
    setUserLoc(data);
  }
});
    socket.on("emergencyCancelled", (data?: { emergencyId?: string }) => {
      if (data?.emergencyId && data.emergencyId !== emergencyId) return;
      setAmbulanceVisible(false);
      setIsPaused(false);
      setAmbulanceCrossed(false);
      setStatus("Ready");
      setDistance(0);
      setEmergencyId(null);
      setEmergencyStatus("idle");
      setEmergencyError(null);
    });

    return () => {
      socket.off("connect");
      socket.off("ambulanceNearby");
      socket.off("userPaused");
      socket.off("userResumed");
      socket.off("ambulanceCrossed");
      socket.off("ambulanceUpdate");
      socket.off("userLocationUpdate");
      socket.off("emergencyCancelled");
    };
  }, [ambulanceVisible, ambulanceCrossed, userLoc, isPaused, emergencyId]);
  
  return (
    <>
      {/* Big Popup Notification - Outside and above main app */}
      {showPopup && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: "#ff0000",
            color: "white",
            padding: "30px 20px",
            textAlign: "center",
            boxShadow: "0 10px 40px rgba(255, 0, 0, 0.8)",
            zIndex: 99999,
            animation: "slideDown 0.5s ease-out",
            borderBottom: "5px solid #fff"
          }}
        >
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ fontSize: "60px", marginBottom: "10px" }}>🚨</div>
            <h1 style={{ fontSize: "32px", margin: "0 0 10px 0", fontWeight: "bold", textTransform: "uppercase" }}>
              AMBULANCE APPROACHING!
            </h1>
            <p style={{ fontSize: "18px", margin: "0 0 15px 0" }}>
              Emergency vehicle is within 1km of your location - Please clear the path immediately!
            </p>
            <button
              onClick={() => setShowPopup(false)}
              style={{
                padding: "10px 25px",
                fontSize: "16px",
                backgroundColor: "white",
                color: "#ff0000",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
                boxShadow: "0 2px 10px rgba(0,0,0,0.2)"
              }}
            >
              OK, GOT IT
            </button>
          </div>
        </div>
      )}

      <div className="user-panel">
        <h2 style={{ textAlign: "center" }}>YOUR ROUTE</h2>

      <MapContainer
        center={[userLoc.lat, userLoc.lng]}
        zoom={15}
        style={{ height: "500px" }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapUpdater center={userLoc} />

        {/* User */}
        <Marker position={[userLoc.lat, userLoc.lng]} icon={userIcon} />

        {/* Destination */}
        <Marker position={[destLoc.lat, destLoc.lng]} icon={createCustomIcon("#3b82f6")} />

        {/* Ambulance */}
        {ambulanceVisible && (
          <>
            <Marker
              position={[ambulanceLoc.lat, ambulanceLoc.lng]}
              icon={ambulanceIcon}
            />
            <Polyline
              positions={[
                [userLoc.lat, userLoc.lng],
                [ambulanceLoc.lat, ambulanceLoc.lng],
              ]}
              pathOptions={{
                color: "red",
                dashArray: "5,5",
              }}
            />
          </>
        )}
      </MapContainer>

      {ambulanceVisible ? (
        <div className="ambulance-info-box">
          <div className="ambulance-distance-message">
            {!ambulanceCrossed ? (
              <>
                <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ef4444", marginBottom: "5px" }}>
                  🚨 Ambulance {distance.toFixed(1)}km away
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>CLEAR THE PATH!</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: "24px", fontWeight: "bold", color: "#f59e0b", marginBottom: "5px" }}>
                  🚕 Ambulance {distance.toFixed(1)}km away
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>Moving away from your location</div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="ambulance-info-box" style={{ backgroundColor: "#f0fdf4" }}>
          <div style={{ color: "#666", textAlign: "center", fontSize: "14px" }}>
            No ambulance nearby - Safe to continue
          </div>
        </div>
      )}

      {ambulanceVisible && ambulanceCrossed && (
        <div style={{ marginTop: 10, fontWeight: "bold", color: "orange" }}>
          🚨 Ambulance moving away ({distance.toFixed(2)} km)
        </div>
      )}

      {emergencyStatus === "active" && emergencyId && (
        <div className="emergency-request-note">
          Request ID: {emergencyId}
        </div>
      )}

      {emergencyStatus === "failed" && emergencyError && (
        <div className="emergency-request-error">{emergencyError}</div>
      )}

      <div className="emergency-icons-bottom">
        <button
          className={`emergency-request-btn ${emergencyStatus === "active" ? "active" : ""}`}
          onClick={emergencyStatus === "active" ? cancelEmergency : requestEmergency}
          disabled={emergencyStatus === "requesting" || emergencyStatus === "canceling"}
        >
          {emergencyStatus === "active" ? "Cancel Emergency" : "Request Ambulance"}
        </button>
        <button
          className="emergency-btn-icon-bottom"
          onClick={() => window.location.href = "tel:112"}
          title="Call 112"
        >
          <span className="emergency-number-bottom">112</span>
        </button>
        <button
          className="emergency-btn-icon-bottom"
          onClick={() => window.location.href = "tel:108"}
          title="Call 108"
        >
          <span className="emergency-number-bottom">108</span>
        </button>
      </div>
      </div>
    </>
  );
}
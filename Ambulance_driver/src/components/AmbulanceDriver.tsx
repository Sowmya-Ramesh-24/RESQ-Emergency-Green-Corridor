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

// Default fallback coordinates
const FALLBACK_DRIVER: Location = {
  lat: 12.9010,
  lng: 77.6440,
};

const FALLBACK_DEST: Location = {
  lat: 12.8615,
  lng: 77.6643,
};

// Custom marker icons
const createCustomIcon = (color: string) => {
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 30px;
        height: 40px;
        border-radius: 50% 50% 50% 0%;
        transform: rotate(-45deg);
        box-shadow: 0 0 0 2px white;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="transform: rotate(45deg); font-size: 16px;">📍</span>
      </div>
    `,
    iconSize: [30, 40],
    className: "custom-marker",
  });
};

const driverIcon = createCustomIcon("#ef4444");
const destIcon = createCustomIcon("#3b82f6");

const getSignalColor = (state: string | undefined) => {
  const normalized = (state || "").trim().toUpperCase();

  if (normalized === "GREEN") return "#22c55e";
  if (normalized === "YELLOW" || normalized === "AMBER") return "#f59e0b";
  if (normalized === "RED") return "#ef4444";

  return "#9ca3af";
};

// Traffic signal icon
const createTrafficSignalIcon = (color: string) => {
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid #333;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <span style="font-size: 12px;">🚦</span>
      </div>
    `,
    iconSize: [24, 24],
    className: "traffic-signal",
  });
};

// Component to update map view when driver location changes
function MapUpdater({ center }: { center: Location }) {
  const map = useMap();

  useEffect(() => {
    console.log("📍 Updating map center to:", center);
    map.setView([center.lat, center.lng], map.getZoom());
  }, [center, map]);

  return null;
}

export default function AmbulanceDriver() {
  const [sosActive, setSosActive] = useState(false);
  const [driverLoc, setDriverLoc] = useState<Location>(FALLBACK_DRIVER);
  const [dropLoc, setDropLoc] = useState<Location>(FALLBACK_DEST);
  const [status, setStatus] = useState("Inactive");
  const [routePath, setRoutePath] = useState<Location[]>([]);
  const [signalStates, setSignalStates] = useState<{[key: string]: string}>({
    south: "RED",
    north: "RED",
    east: "RED",
    west: "RED"
  });

  // Keep latest driver location reference
  const driverRef = useRef(driverLoc);

  useEffect(() => {
    driverRef.current = driverLoc;
  }, [driverLoc]);

  // Smooth animation function
  const animateMarker = (
    start: Location,
    end: Location,
    duration: number = 300
  ) => {
    console.log("🎬 Animating from", start, "to", end);
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease-out for smoother motion
      const eased = 1 - Math.pow(1 - progress, 2);

      const lat = start.lat + (end.lat - start.lat) * eased;
      const lng = start.lng + (end.lng - start.lng) * eased;

      setDriverLoc({ lat, lng });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log("✅ Animation complete at", { lat, lng });
      }
    };

    requestAnimationFrame(animate);
  };

  // Socket listener
  useEffect(() => {
    console.log("Setting up socket listeners...");
    
    socket.on("connect", () => {
      console.log("✅ Connected to backend:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("❌ Disconnected from backend");
    });

    socket.on("ambulanceUpdate", (data: Location) => {
      console.log("📍 Received ambulance update:", data);
      animateMarker(driverRef.current, data, 300); // Match backend speed
    });

    socket.on("routePath", (data: { path: Location[]; pickup: Location; dropoff: Location }) => {
      console.log("🗺️ Received route path with", data.path.length, "points");
      setRoutePath(data.path);
      setDriverLoc(data.pickup);
      setDropLoc(data.dropoff);
      setStatus("Simulation Active");
    });

    socket.on("signal-update", (data: {[key: string]: string}) => {
      console.log("🚦 Signal update received:", data);
      setSignalStates(data);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("ambulanceUpdate");
      socket.off("routePath");
      socket.off("signal-update");
    };
  }, []);

  const handleDropSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const address = (form.elements.namedItem("address") as HTMLInputElement).value;

    if (!address) return;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          address
        )}`
      );
      const data = await res.json();

      if (data.length > 0) {
        setDropLoc({
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        });
        setStatus("En Route");
        
        // Automatically start simulation with the destination
        startSimulation(driverLoc, {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        });
      } else {
        alert("Location not found");
      }
    } catch (err) {
      console.error(err);
      alert("Error fetching location");
    }
  };

  const startSimulation = async (start: Location, dest: Location) => {
    try {
      console.log("🚀 Starting simulation to", dest);
      const backendUrl = import.meta.env.VITE_BACKEND_URL;; // Match your socket URL
      const response = await fetch(`${backendUrl}/simulate/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        
        body: JSON.stringify({
          startLat: start.lat,
          startLng: start.lng,
          destLat: dest.lat,
          destLng: dest.lng,
        }),
      });
      const data = await response.json();
      console.log("Simulation response:", data);
      setStatus("Simulation Active");
    } catch (err) {
      console.error("Failed to start simulation:", err);
    }
  };

  const startSimulationWithGeojsonPath = async () => {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL;;

    console.log("🚀 Starting ambulance simulation...");
    await fetch(`${backendUrl}/simulate/start`, {
      method: "POST",
    });

    console.log("🚀 Starting user simulation...");
    await fetch(`${backendUrl}/simulate/user/start`, {
      method: "POST",
    });

    console.log("✅ Both simulations started");
  } catch (err) {
    console.error("Failed to start simulations:", err);
  }
};
  return (
    <div className={`driver-panel ${sosActive ? "emergency" : ""}`}>
      <div style={{textAlign:"center"}}>
      <h2 className="driver-title">RESQ</h2>
      </div>
      <form onSubmit={handleDropSubmit}>
        <input
          name="address"
          placeholder="PESUISMR"
          className="location-input"
        />
        <button type="submit" className="set-btn">
          Set Destination
        </button>
      </form>

      <div className="map-container">
        <MapContainer
          center={[driverLoc.lat, driverLoc.lng] as LatLngExpression}
          zoom={15}
          className="map-leaflet"
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          {/* Update map view when driver location changes */}
          <MapUpdater center={driverLoc} />

          <Marker
            position={[driverLoc.lat, driverLoc.lng]}
            icon={driverIcon}
          />

          <Marker
            position={[dropLoc.lat, dropLoc.lng]}
            icon={destIcon}
          />

          {/* Traffic Signal Icons - positioned on route */}
          {routePath.length > 0 && (
            <>
              {/* South signal - early in route */}
              <Marker
                position={[routePath[Math.floor(routePath.length * 0.3)]?.lat || driverLoc.lat, 
                          routePath[Math.floor(routePath.length * 0.3)]?.lng || driverLoc.lng]}
                icon={createTrafficSignalIcon(getSignalColor(signalStates.south))}
                title="South Signal"
              />
              
              {/* North signal - later in route */}
              <Marker
                position={[routePath[Math.floor(routePath.length * 0.7)]?.lat || dropLoc.lat, 
                          routePath[Math.floor(routePath.length * 0.7)]?.lng || dropLoc.lng]}
                icon={createTrafficSignalIcon(getSignalColor(signalStates.north))}
                title="North Signal"
              />
            </>
          )}

          {/* Show the complete route path if available, otherwise show straight line */}
          {routePath.length > 0 ? (
            <Polyline
              positions={routePath.map(point => [point.lat, point.lng] as LatLngExpression)}
              color="#3b82f6"
              weight={4}
              opacity={0.7}
            />
          ) : (
            <Polyline
              positions={[
                [driverLoc.lat, driverLoc.lng],
                [dropLoc.lat, dropLoc.lng],
              ]}
              color="blue"
              weight={3}
              opacity={0.7}
            />
          )}
        </MapContainer>
      </div>

      <button
        onClick={() => {
          setSosActive(!sosActive);
          setStatus(!sosActive ? "Emergency Mode" : "Inactive");

          // Start simulation when SOS is activated
          if (!sosActive) {
            console.log("🚨 SOS activated - notifying users");
            const ambulanceId = socket.id || "AMB-1";
            const payload = {
              ambulance_id: ambulanceId,
              ambulance_lat: driverLoc.lat,
              ambulance_lon: driverLoc.lng,
              lat: driverLoc.lat,
              lng: driverLoc.lng
            };
            // Emit ambulance starting location to users
            socket.emit("sosActivated", payload);
            startSimulationWithGeojsonPath();
          } else {
            console.log("🛑 SOS deactivated");
            socket.emit("sosCancelled");
          }
        }}
        className={`sos-btn ${sosActive ? "active" : ""}`}
      >
        🚨 SOS
      </button>
    </div>
  );
}

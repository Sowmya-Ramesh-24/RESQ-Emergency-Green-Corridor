from flask import Flask, request, jsonify
import joblib
import pandas as pd
from datetime import datetime
import math
import os
app = Flask(__name__)

# ----------------------------
# CONFIGURATION
# ----------------------------
DEMO_MODE = True
DEMO_SCALE = 0.6
SAFETY_BUFFER = 3
DISTANCE_THRESHOLD = 300  # meters

# Track triggered signals per ambulance
triggered_signals = {}

# ----------------------------
# LOAD MODEL
# ----------------------------
model = joblib.load("traffic_model.pkl")
model_columns = joblib.load("model_columns.pkl")

# ----------------------------
# SIGNAL COORDINATES
# ----------------------------
SIGNALS = {
    "signal_1": {"lat": 12.9716, "lon": 77.5946},
    "signal_2": {"lat": 12.9725, "lon": 77.5955},
    "signal_3": {"lat": 12.9732, "lon": 77.5962}
}

# ----------------------------
# TRAFFIC PREDICTION
# ----------------------------
def predict_total_traffic():
    now = datetime.now()

    input_data = {
        'temp': 280,
        'rain_1h': 0,
        'snow_1h': 0,
        'clouds_all': 40,
        'hour': now.hour,
        'day': now.weekday(),
        'month': now.month
    }

    df = pd.DataFrame([input_data])

    for col in model_columns:
        if col not in df.columns:
            df[col] = 0

    df = df[model_columns]
    return model.predict(df)[0]

# ----------------------------
# GREEN TIME CALCULATION
# ----------------------------
def predict_green_times():
    total_traffic = predict_total_traffic()
    now = datetime.now()
    hour = now.hour

    if 7 <= hour <= 11:
        weights = {"north": 0.4, "south": 0.3, "east": 0.2, "west": 0.1}
    elif 16 <= hour <= 20:
        weights = {"north": 0.2, "south": 0.4, "east": 0.25, "west": 0.15}
    else:
        weights = {"north": 0.25, "south": 0.25, "east": 0.25, "west": 0.25}

    direction_traffic = {
        direction: total_traffic * weight
        for direction, weight in weights.items()
    }

    MAIN_TOTAL_CYCLE = 24
    NORTH_TOTAL_CYCLE = 12
    MIN_GREEN = 3

    green_times = {}

    # Independent north
    green_times["north"] = max(
        MIN_GREEN,
        int((direction_traffic["north"] / total_traffic) * NORTH_TOTAL_CYCLE)
    )

    # Main junction
    main_traffic = (
        direction_traffic["south"] +
        direction_traffic["east"] +
        direction_traffic["west"]
    )

    for direction in ["south", "east", "west"]:
        proportion = direction_traffic[direction] / main_traffic
        green_times[direction] = max(
            MIN_GREEN,
            int(proportion * MAIN_TOTAL_CYCLE)
        )

    return green_times

# ----------------------------
# SPEED & ETA
# ----------------------------
def estimate_speed(traffic):
    if traffic > 5000:
        return 25
    elif traffic > 3000:
        return 40
    else:
        return 60

def calculate_eta(distance_m, speed_kmh):
    speed_mps = (speed_kmh * 1000) / 3600
    return distance_m / speed_mps

# ----------------------------
# HAVERSINE
# ----------------------------
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2) ** 2

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# ----------------------------
# NORMAL MODE
# ----------------------------
@app.route("/predict", methods=["GET"])
def predict():
    return jsonify(predict_green_times())

# ----------------------------
# CONTINUOUS CORRIDOR UPDATE
# ----------------------------
@app.route("/ambulance/update", methods=["POST"])
def ambulance_update():

    data = request.json
    amb_id = data.get("ambulance_id")
    amb_lat = data.get("ambulance_lat")
    amb_lon = data.get("ambulance_lon")

    if amb_id is None or amb_lat is None or amb_lon is None:
        return jsonify({"error": "ambulance_id, latitude and longitude required"}), 400

    if amb_id not in triggered_signals:
        triggered_signals[amb_id] = []

    upcoming_signal = None
    upcoming_distance = float("inf")

    for name, coords in SIGNALS.items():

        distance = haversine(
            amb_lat, amb_lon,
            coords["lat"], coords["lon"]
        )

        # Only consider forward and within threshold
        if distance < DISTANCE_THRESHOLD and name not in triggered_signals[amb_id]:

            if distance < upcoming_distance:
                upcoming_distance = distance
                upcoming_signal = name

    if upcoming_signal is None:
        return jsonify({"status": "no_signal_in_range"})

    total_traffic = predict_total_traffic()
    speed = estimate_speed(total_traffic)
    eta = calculate_eta(upcoming_distance, speed)

    if DEMO_MODE:
        eta *= DEMO_SCALE

    trigger_green_time = max(0, eta - SAFETY_BUFFER)

    triggered_signals[amb_id].append(upcoming_signal)

    return jsonify({
        "nearest_signal": upcoming_signal,
        "distance_m": round(upcoming_distance, 2),
        "eta_seconds": round(eta, 2),
        "trigger_green_in_sec": round(trigger_green_time, 2)
    })

if __name__ == "__main__":
    app.run(port=int(os.environ.get("ML_PORT", 5001)))

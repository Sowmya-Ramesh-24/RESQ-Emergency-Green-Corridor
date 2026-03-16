# RESQ An AI-powered emergency green corridor
Powered through:
- Automatic green corridor with phase-based traffic signal control
- Real-time user alerts with distance tracking when ambulance is within 1km
- ML-predicted green times based on live traffic volume data
- ESP32 hardware controlling physical traffic signals on the ground

## System Architecture
---
```
┌─────────────────────┐      UDP Stream         ┌─────────────────────┐
│   Ambulance Driver  │   (WebSocket/HTTP)      │   Node.js Backend   │
│  (React + Leaflet)  │ ──────────────────────► │  Express + Socket   │
│                     │                         │                     │
│  - SOS Button       │ ◄────────────────────── │  - Route tracking   │
│  - Live Map         │     Live Updates        │  - Proximity check  │
│  - Route View       │                         │  - Junction phases  │
└─────────────────────┘                         └─────────┬───────────┘
                                                          │
┌─────────────────────┐      WebSocket                    │
│     Road User       │ ◄─────────────────────────────────┤
│  (React + Leaflet)  │                                   │ TCP Commands
│                     │                                   │
│  - 1km Alert        │                        ┌──────────▼───────────┐
│  - Distance Tracker │                        │  Python ML Service   │
│  - Auto Pause/Resume│                        │  Flask (port 5001)   │
└─────────────────────┘                        │                      │
                                               │  - Green time pred   │
                                               │  - Phase prediction  │
                                               │  - RandomForest      │
                                               └──────────┬───────────┘
                                                          │
                                                          │ Serial (SCP)
                                               ┌──────────▼───────────┐
                                               │       ESP32          │
                                               │  Signal Controller   │
                                               │                      │
                                               │  - North Signal      │
                                               │  - South Signal      │
                                               │  - East Signal       │
                                               │  - West Signal       │
                                               └──────────────────────┘
```
## Project Structure
---
```
Ambulance/
├── Ambulance_driver/
│   └── src/
│       ├── components/
│       │   └── AmbulanceDriver.tsx   # Driver dashboard (SOS + live map)
│       ├── socket.ts                 # Socket.io client config
│       ├── .env                      # Environment variables
│       └── .env.example              # Environment template
│
├── User/
│   └── src/
│       ├── components/
│       │   └── user.tsx              # User dashboard (alerts + map)
│       ├── socket.ts                 # Socket.io client config
│       ├── .env                      # Environment variables
│       └── .env.example              # Environment template
│
├── backend/
│   ├── data/
│   │   ├── junction.geojson          # Ambulance route path
│   │   └── user.geojson              # User route path
│   ├── ml/
│   │   ├── app.py                    # Flask ML service
│   │   ├── train_model.py            # Model training script
│   │   └── requirements.txt          # Python dependencies
│   ├── models/
│   │   ├── Junction.js               # MongoDB junction schema
│   │   ├── Signal.js                 # MongoDB signal schema
│   │   └── User.js                   # MongoDB user schema
│   ├── routes/
│   │   ├── ambulance.js              # Signal corridor logic
│   │   ├── emergency.js              # Emergency request/cancel
│   │   ├── simulate.js               # Route simulation
│   │   └── user.js                   # User location updates
│   ├── services/
│   │   ├── adaptiveTrafficService.js # Normal/emergency traffic loop
│   │   ├── esp32Serivce.js           # Serial comms with ESP32
│   │   ├── junctionService.js        # Phase transition logic
│   │   ├── mlService.js              # ML service calls
│   │   ├── pathService.js            # GeoJSON route loader
│   │   └── signalService.js          # Signal state + emit
│   ├── server.js                     # Entry point
│   ├── .env                          # Environment variables
│   └── .env.example                  # Environment template
│
├── .gitignore
└── README.md          
```
## Setup Instructions 
1. Environment setup
```bash
# Copy env templates for all three folders
cp backend/.env.example backend/.env
cp Ambulance_driver/.env.example Ambulance_driver/.env
cp User/.env.example User/.env
```
2. Backend Setup
```bash
cd backend
# Install Node dependencies (includes socket.io, mongoose, serialport)
npm install
# Start the backend server
node server.js
```
3. ML service setup
```bash
cd backend/ml
# Install Python dependencies
pip install -r requirements.txt
# Download dataset from Kaggle — place in backend/ml/
# https://www.kaggle.com/datasets/anshtanwar/metro-interstate-traffic-volume
# File needed: Metro_Interstate_Traffic_Volume.csv

# Train the model (run only once)
python train_model.py

# Start the ML service
python app.py
```
4. Ambulance Driver Frontend Setup
```bash
cd Ambulance_driver

# Install dependencies (includes socket.io-client, leaflet)
npm install

# Start on port 5173
npm run dev
```

5. User Driver Frontend Setup
```bash
cd User

# Install dependencies (includes socket.io-client, leaflet)
npm install

# Start on port 5174
npm run dev -- --port 5174
```
6. ESP32 Hardware Setup
   Components needed
   - ESP32 development board
   - Traffic Light Led Modules
   - Breadboard + jumper wires
   - USB cable (for serial communication with laptop)
> If no ESP32 is connected the system still runs.
---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Driver Frontend | React, Vite, Leaflet, Socket.io-client |
| User Frontend | React, Vite, Leaflet, Socket.io-client |
| Backend | Node.js, Express, Socket.io, MongoDB |
| ML Service | Python, Flask, scikit-learn, RandomForest |
| Hardware | ESP32, Arduino, SerialPort |
| Coordinates| Geojson.io |

## Notes
- Route paths are GeoJSON files in backend/data/ — edit to change the simulated route
- Signal coordinates in backend/routes/ambulance.js and backend/ml/app.py are set for a Bangalore route — update for your location
- traffic_model.pkl, model_columns.pkl and Metro_Interstate_Traffic_Volume.csv are gitignored — generate locally by running train_model.py
                    

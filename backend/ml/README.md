# ML Traffic Signal Service

Integrated ML model for predicting optimal traffic signal phases based on ambulance position and timing.

## Setup

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Ensure model files exist
- `traffic_model.pkl` - Trained ML model
- `model_columns.pkl` - Feature columns used in training

### 3. Start ML service
```bash
python app.py
```

The service runs on `http://localhost:5001`

## Features Used
- **ambulance_lat**: Current ambulance latitude
- **current_phase**: Current traffic signal phase (0-3)
- **time_in_phase_seconds**: Duration spent in current phase
- **hour**: Current hour (temporal feature)
- **minute**: Current minute (temporal feature)

## Integration

The ML service is automatically called from `junctionService.js`:
- Predictions guide phase transitions
- Falls back to rule-based logic if ML service is unavailable
- All predictions are logged with confidence scores

## Endpoints

### POST `/predict-phase`
Predict next signal phase
```json
{
  "ambulanceLat": 12.878,
  "currentPhase": 1,
  "phaseStartTime": 1708502400000
}
```

Response:
```json
{
  "nextPhase": 2,
  "confidence": 0.95,
  "timeInPhase": 6.5
}
```

### GET `/health`
Check ML service status
```json
{
  "status": "ML service running",
  "model_loaded": true
}
```

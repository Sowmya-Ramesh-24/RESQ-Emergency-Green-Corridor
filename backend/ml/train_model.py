import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
import joblib

# Load dataset
df = pd.read_csv("Metro_Interstate_Traffic_Volume.csv")

# Convert date_time column
df['date_time'] = pd.to_datetime(df['date_time'], dayfirst=True)


# Extract time features
df['hour'] = df['date_time'].dt.hour
df['day'] = df['date_time'].dt.dayofweek
df['month'] = df['date_time'].dt.month

# Drop unnecessary columns
df = df.drop(columns=['date_time', 'weather_description'])

# Convert categorical variables
df = pd.get_dummies(df, columns=['holiday', 'weather_main'], drop_first=True)

# Define features and target
X = df.drop(columns=['traffic_volume'])
y = df['traffic_volume']

joblib.dump(X.columns, "model_columns.pkl")

# Train/test split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Train model
model = RandomForestRegressor(n_estimators=100)
model.fit(X_train, y_train)

# Evaluate model
predictions = model.predict(X_test)
mae = mean_absolute_error(y_test, predictions)

print("Model trained successfully!")
print("Mean Absolute Error:", mae)

# Save model
joblib.dump(model, "traffic_model.pkl")
print("Model saved as traffic_model.pkl")

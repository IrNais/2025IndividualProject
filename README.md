# ECG Visualizer

A web-based ECG signal visualization and ternary plot analysis tool.

## Features

### Upper Section: ECG Signal Visualization
- Support for uploading WFDB format files (.dat, .hea)
- Real-time display of ECG signal waveforms
- Multi-lead signal display
- Interactive charts with zoom and pan capabilities
- Display of detailed ECG metadata information

### Lower Section: Ternary Plot Analysis
- Support for uploading CSV files for ternary plot analysis
- Data table display
- Ternary plot visualization grouped by class
- Data normalization processing

## Installation

1. **Clone the project**
   ```bash
   git clone <repository-url>
   cd ECGvisualiser
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   
   # Windows
   venv\Scripts\activate
   
   # Linux/Mac
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

## Running the Project

1. **Start Flask application**
   ```bash
   python app.py
   ```

2. **Access the application**
   Open browser and visit `http://localhost:5000`

## Usage Instructions

### ECG Signal Visualization
1. Select WFDB files in the upper section (need to upload both .dat and .hea files)
2. Click "Upload WFDB" button
3. The system will display ECG signal waveforms and related information

### Ternary Plot Analysis
1. Select CSV file in the lower section
2. Ensure CSV file contains: title, class, value1, value2, value3 columns
3. Click "Upload CSV" button
4. The system will display data table and ternary plot

## File Format Specifications

### WFDB File Format
- `.hea` file: Contains signal metadata (sampling frequency, signal names, etc.)
- `.dat` file: Contains actual signal data


### CSV File Format
Must contain the following columns:
- `title`: Data point title
- `class`: Classification label
- `value1`: First value
- `value2`: Second value
- `value3`: Third value

Example:
```csv
title,class,value1,value2,value3
Sample1,ClassA,0.3,0.4,0.3
Sample2,ClassB,0.5,0.2,0.3
```

## Technology Stack

- **Backend**: Flask (Python)
- **Frontend**: HTML, JavaScript
- **Visualization**: Plotly.js, Chart.js
- **Data Processing**: NumPy, WFDB

## Dependencies

- Flask==2.3.3
- numpy==2.3.1
- wfdb==4.3.0
- scipy==1.15.3
- pandas==2.3.1
- matplotlib==3.10.3

## Notes

1. WFDB files need to be uploaded in pairs (.dat and .hea files)
2. CSV files must strictly follow the specified format
3. If WFDB file reading fails, the system will generate mock data for demonstration
4. Modern browsers are recommended for the best experience 

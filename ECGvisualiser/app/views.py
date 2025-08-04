import csv
import io
import os
import tempfile
import numpy as np
import wfdb
import traceback
from flask import Blueprint, request, render_template, jsonify, send_file
from .models import validate_csv, get_column_mapping

blueprint = Blueprint('blue', __name__)

@blueprint.route('/')
def index_page():
    return render_template('index.html')

@blueprint.route('/help')
def help_page():
    return render_template('help.html')

@blueprint.route('/download_template')
def download_template():
    """Provide Ternary Plot CSV template file download"""
    template_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'Ternary_Plot_Template.csv')
    return send_file(template_path, as_attachment=True, download_name='Ternary_Plot_Template.csv')

@blueprint.route('/upload', methods=['POST'])
def upload_csv():
    file = request.files.get('file')
    if not file or not file.filename.endswith('.csv'):
        return jsonify({'error': 'Invalid file format'}), 400

    stream = io.StringIO(file.stream.read().decode("utf-8"))
    reader = csv.DictReader(stream)
    
    # Get column mapping
    column_mapping = get_column_mapping(reader.fieldnames)

    # Validate CSV format
    if not validate_csv(reader.fieldnames):
        return jsonify({'error': 'CSV file must contain columns: title, class, value1, value2, value3 (case insensitive)'}), 400

    # Read and process data
    data = []
    for row in reader:
        processed_row = {}
        for expected_col, csv_col in column_mapping.items():
            if csv_col in row:
                processed_row[expected_col] = row[csv_col]
            else:
                return jsonify({'error': f'Missing required column: {csv_col}'}), 400
        data.append(processed_row)

    # Get actual column names for value columns
    value_column_names = []
    for i in range(1, 4):
        value_key = f'value{i}'
        if value_key in column_mapping:
            value_column_names.append(column_mapping[value_key])

    return jsonify({
        'data': data,
        'column_names': {
            'title': column_mapping.get('title', 'title'),
            'class': column_mapping.get('class', 'class'),
            'value1': value_column_names[0] if len(value_column_names) > 0 else 'value1',
            'value2': value_column_names[1] if len(value_column_names) > 1 else 'value2',
            'value3': value_column_names[2] if len(value_column_names) > 2 else 'value3'
        }
    })

@blueprint.route('/upload_wfdb', methods=['POST'])
def upload_wfdb():
    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'No files uploaded'}), 400
    
    # Check for required WFDB files
    file_names = [f.filename for f in files]
    print(f"Uploaded files: {file_names}")  # Debug info
    
    has_dat = any(f.endswith('.dat') for f in file_names)
    has_hea = any(f.endswith('.hea') for f in file_names)
    
    print(f"Contains .dat file: {has_dat}, Contains .hea file: {has_hea}")  # Debug info
    
    # Provide detailed error information
    if not has_dat and not has_hea:
        return jsonify({
            'error': 'No WFDB files found. Please upload .dat and .hea files.',
            'details': 'WFDB format requires both .dat (signal data) and .hea (header) files.'
        }), 400
    elif not has_dat:
        return jsonify({
            'error': 'Missing .dat file. Please upload the .dat file containing signal data.',
            'details': 'The .dat file contains the actual ECG signal data.'
        }), 400
    elif not has_hea:
        return jsonify({
            'error': 'Missing .hea file. Please upload the .hea file containing header information.',
            'details': 'The .hea file contains metadata like sampling frequency, signal names, and units.'
        }), 400
    
    try:
        # Create temporary directory to save files
        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"Temporary directory: {temp_dir}")  # Debug info
            
            # Save all uploaded files
            for file in files:
                if file.filename:
                    file_path = os.path.join(temp_dir, file.filename)
                    file.save(file_path)
                    print(f"Saved file: {file_path}")  # Debug info
            
            # Process WFDB files
            ecg_data = process_wfdb_files(temp_dir)
            return jsonify(ecg_data)
    
    except Exception as e:
        error_msg = f'Error processing WFDB files: {str(e)}'
        print(f"Error details: {error_msg}")  # Debug info
        print(f"Full error: {traceback.format_exc()}")  # Full error stack
        return jsonify({'error': error_msg}), 500

def process_wfdb_files(temp_dir):
    """
    Process WFDB files and return ECG data
    Use wfdb library to read real ECG data
    """
    # Find .dat and .hea files
    dat_files = [f for f in os.listdir(temp_dir) if f.endswith('.dat')]
    hea_files = [f for f in os.listdir(temp_dir) if f.endswith('.hea')]
    
    print(f"Found .dat files: {dat_files}")  # Debug info
    print(f"Found .hea files: {hea_files}")  # Debug info
    
    if not dat_files or not hea_files:
        raise ValueError("Missing required WFDB files")
    
    # Use the first found file pair
    dat_file = dat_files[0]
    hea_file = hea_files[0]
    
    # Get record name (remove extension)
    record_name = hea_file.replace('.hea', '')
    print(f"Record name: {record_name}")  # Debug info
    
    try:
        # Use wfdb library to read record
        record_path = os.path.join(temp_dir, record_name)
        print(f"Attempting to read record: {record_path}")  # Debug info
        
        record = wfdb.rdrecord(record_path)
        print(f"Successfully read record, signal shape: {record.p_signal.shape}")  # Debug info
        
        # Get signal data
        signals = record.p_signal
        signal_names = record.sig_name
        units = record.units
        sampling_frequency = record.fs
        
        print(f"Signal names: {signal_names}")  # Debug info
        print(f"Units: {units}")  # Debug info
        print(f"Sampling frequency: {sampling_frequency}")  # Debug info
        
        # Generate time axis
        num_samples = signals.shape[0]
        time = np.linspace(0, num_samples / sampling_frequency, num_samples)
        
        # Prepare return data
        signal_data = []
        for i in range(signals.shape[1]):
            signal_data.append({
                'name': signal_names[i] if i < len(signal_names) else f'Signal_{i+1}',
                'unit': units[i] if i < len(units) else 'mV',
                'data': signals[:, i].tolist()
            })
        
        metadata = {
            'record_name': record_name,
            'num_signals': signals.shape[1],
            'sampling_frequency': sampling_frequency,
            'signal_names': signal_names.tolist() if hasattr(signal_names, 'tolist') else signal_names,
            'units': units.tolist() if hasattr(units, 'tolist') else units
        }
        
        return {
            'metadata': metadata,
            'signal_data': {
                'time': time.tolist(),
                'signals': signal_data,
                'num_samples': num_samples
            },
            'filename': record_name
        }
        
    except Exception as e:
        # WFDB reading failed, return error message to user
        error_msg = f'Failed to read WFDB files: {str(e)}'
        print(f"WFDB reading failed: {error_msg}")
        return jsonify({
            'error': 'Failed to read WFDB files. Please check your file format.',
            'details': f'Error: {str(e)}'
        }), 400

def generate_mock_ecg_data(record_name):
    """Generate mock ECG data (used when real WFDB reading fails)"""
    sampling_frequency = 250  # Hz
    num_samples = 1000
    num_signals = 3
    
    time = np.linspace(0, num_samples / sampling_frequency, num_samples)
    
    signals = []
    signal_names = ['I', 'II', 'III']
    units = ['mV', 'mV', 'mV']
    
    for i in range(num_signals):
        signal = generate_mock_ecg(time, i)
        signals.append({
            'name': signal_names[i],
            'unit': units[i],
            'data': signal.tolist()
        })
    
    metadata = {
        'record_name': record_name,
        'num_signals': num_signals,
        'sampling_frequency': sampling_frequency,
        'signal_names': signal_names,
        'units': units
    }
    
    return {
        'metadata': metadata,
        'signal_data': {
            'time': time.tolist(),
            'signals': signals,
            'num_samples': num_samples
        },
        'filename': record_name
    }

def generate_mock_ecg(time, signal_index):
    """Generate mock ECG signal"""
    # Base frequency
    base_freq = 1.2  # Hz (approximately 50 BPM)
    
    # Generate basic heartbeat signal
    signal = np.zeros_like(time)
    
    # Add multiple heartbeat cycles
    for i in range(5):
        t_offset = i / base_freq
        # P wave
        p_wave = 0.1 * np.exp(-((time - t_offset - 0.1) ** 2) / 0.001)
        # QRS complex
        qrs = 1.0 * np.exp(-((time - t_offset - 0.2) ** 2) / 0.0005)
        # T wave
        t_wave = 0.3 * np.exp(-((time - t_offset - 0.3) ** 2) / 0.002)
        
        signal += p_wave + qrs + t_wave
    
    # Add some noise
    noise = 0.05 * np.random.randn(len(time))
    signal += noise
    
    # Add variations for different leads
    if signal_index == 1:
        signal *= 0.8  # Second lead has slightly smaller amplitude
    elif signal_index == 2:
        signal *= 1.2  # Third lead has slightly larger amplitude
    
    return signal

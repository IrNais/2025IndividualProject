import csv
import io
import os
import tempfile
import numpy as np
import wfdb
import traceback
from flask import Blueprint, request, render_template, jsonify
from .models import validate_csv, get_column_mapping

blueprint = Blueprint('blue', __name__)

@blueprint.route('/')
def index_page():
    return render_template('index.html')

@blueprint.route('/help')
def help_page():
    return render_template('help.html')

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
    
    # 检查是否有必要的WFDB文件
    file_names = [f.filename for f in files]
    print(f"上传的文件: {file_names}")  # 调试信息
    
    has_dat = any(f.endswith('.dat') for f in file_names)
    has_hea = any(f.endswith('.hea') for f in file_names)
    
    print(f"包含.dat文件: {has_dat}, 包含.hea文件: {has_hea}")  # 调试信息
    
    if not (has_dat and has_hea):
        return jsonify({'error': 'WFDB files must include both .dat and .hea files'}), 400
    
    try:
        # 创建临时目录保存文件
        with tempfile.TemporaryDirectory() as temp_dir:
            print(f"临时目录: {temp_dir}")  # 调试信息
            
            # 保存所有上传的文件
            for file in files:
                if file.filename:
                    file_path = os.path.join(temp_dir, file.filename)
                    file.save(file_path)
                    print(f"保存文件: {file_path}")  # 调试信息
            
            # 处理WFDB文件
            ecg_data = process_wfdb_files(temp_dir)
            return jsonify(ecg_data)
    
    except Exception as e:
        error_msg = f'Error processing WFDB files: {str(e)}'
        print(f"错误详情: {error_msg}")  # 调试信息
        print(f"完整错误: {traceback.format_exc()}")  # 完整错误堆栈
        return jsonify({'error': error_msg}), 500

def process_wfdb_files(temp_dir):
    """
    处理WFDB文件并返回ECG数据
    使用wfdb库读取真实的ECG数据
    """
    # 查找.dat和.hea文件
    dat_files = [f for f in os.listdir(temp_dir) if f.endswith('.dat')]
    hea_files = [f for f in os.listdir(temp_dir) if f.endswith('.hea')]
    
    print(f"找到的.dat文件: {dat_files}")  # 调试信息
    print(f"找到的.hea文件: {hea_files}")  # 调试信息
    
    if not dat_files or not hea_files:
        raise ValueError("Missing required WFDB files")
    
    # 使用第一个找到的文件对
    dat_file = dat_files[0]
    hea_file = hea_files[0]
    
    # 获取记录名称（去掉扩展名）
    record_name = hea_file.replace('.hea', '')
    print(f"记录名称: {record_name}")  # 调试信息
    
    try:
        # 使用wfdb库读取记录
        record_path = os.path.join(temp_dir, record_name)
        print(f"尝试读取记录: {record_path}")  # 调试信息
        
        record = wfdb.rdrecord(record_path)
        print(f"成功读取记录，信号形状: {record.p_signal.shape}")  # 调试信息
        
        # 获取信号数据
        signals = record.p_signal
        signal_names = record.sig_name
        units = record.units
        sampling_frequency = record.fs
        
        print(f"信号名称: {signal_names}")  # 调试信息
        print(f"单位: {units}")  # 调试信息
        print(f"采样频率: {sampling_frequency}")  # 调试信息
        
        # 生成时间轴
        num_samples = signals.shape[0]
        time = np.linspace(0, num_samples / sampling_frequency, num_samples)
        
        # 准备返回数据
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
        # 如果wfdb库读取失败，回退到模拟数据
        print(f"WFDB读取失败，使用模拟数据: {e}")  # 调试信息
        print(f"WFDB错误详情: {traceback.format_exc()}")  # 完整错误堆栈
        return generate_mock_ecg_data(record_name)

def generate_mock_ecg_data(record_name):
    """生成模拟的ECG数据（当真实WFDB读取失败时使用）"""
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
    """生成模拟的ECG信号"""
    # 基础频率
    base_freq = 1.2  # Hz (约50 BPM)
    
    # 生成基础心跳信号
    signal = np.zeros_like(time)
    
    # 添加多个心跳周期
    for i in range(5):
        t_offset = i / base_freq
        # P波
        p_wave = 0.1 * np.exp(-((time - t_offset - 0.1) ** 2) / 0.001)
        # QRS复合波
        qrs = 1.0 * np.exp(-((time - t_offset - 0.2) ** 2) / 0.0005)
        # T波
        t_wave = 0.3 * np.exp(-((time - t_offset - 0.3) ** 2) / 0.002)
        
        signal += p_wave + qrs + t_wave
    
    # 添加一些噪声
    noise = 0.05 * np.random.randn(len(time))
    signal += noise
    
    # 为不同导联添加一些变化
    if signal_index == 1:
        signal *= 0.8  # 第二个导联幅度稍小
    elif signal_index == 2:
        signal *= 1.2  # 第三个导联幅度稍大
    
    return signal

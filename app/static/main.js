// Global variables to store ECG data
let globalECGData = null;
let ecgChart = null;
let csvFilesData = []; // Store multiple CSV files data
let classStyles = {}; // Store custom styles for each class

// WFDB file upload and processing
function uploadWFDB() {
    const fileInput = document.getElementById('wfdbFile');
    const files = fileInput.files;
    
    console.log('Starting WFDB file upload...');
    console.log('Number of selected files:', files.length);
    
    if (files.length === 0) {
        alert("Please select WFDB files.");
        return;
    }

    // Check file types
    const validExtensions = ['.dat', '.hea'];
    const selectedFiles = Array.from(files);
    console.log('Selected files:', selectedFiles.map(f => f.name));
    
    const hasValidFiles = selectedFiles.some(file => 
        validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    );

    if (!hasValidFiles) {
        alert("Please select valid WFDB files (.dat, .hea)");
        return;
    }

    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
        console.log('Adding file to FormData:', file.name, 'size:', file.size, 'bytes');
    });

    // Show loading status
    const plotContainer = document.getElementById('ecgPlotContainer');
    plotContainer.style.display = 'block';
    plotContainer.innerHTML = '<div class="loading">Processing WFDB files...</div>';

    console.log('Sending request to server...');
    
    fetch('/upload_wfdb', {
        method: 'POST',
        body: formData
    })
    .then(resp => {
        console.log('Response received, status:', resp.status);
        console.log('Response headers:', resp.headers);
        
        if (!resp.ok) {
            throw new Error(`HTTP error! Status: ${resp.status}`);
        }
        
        return resp.json();
    })
    .then(result => {
        console.log('Server response data:', result);
        console.log('Data type:', typeof result);
        console.log('Has error property:', 'error' in result);
        
        if (result.error) {
            console.error('Server returned error:', result.error);
            let errorMessage = result.error;
            if (result.details) {
                errorMessage += '<br><br><strong>Details:</strong><br>' + result.details;
            }
            plotContainer.innerHTML = `<div class="error">${errorMessage}</div>`;
        } else {
            console.log('Starting ECG data processing...');
            console.log('ECG data structure:', {
                hasMetadata: !!result.metadata,
                hasSignalData: !!result.signal_data,
                filename: result.filename,
                signalCount: result.signal_data?.signals?.length || 0
            });
            
            globalECGData = result;
            displayECGPlot(result);
            displayECGInfo(result);
            setupChartControls(result);
        }
    })
    .catch(err => {
        console.error("WFDB upload failed:", err);
        console.error("Error details:", {
            name: err.name,
            message: err.message,
            stack: err.stack
        });
        plotContainer.innerHTML = `<div class="error">File processing failed: ${err.message}</div>`;
    });
}

function displayECGPlot(ecgData) {
    console.log('displayECGPlot called, data:', ecgData);
    
    try {
        const plotContainer = document.getElementById('ecgPlotContainer');
        plotContainer.style.display = 'block';
        plotContainer.innerHTML = '<canvas id="ecgChart"></canvas>';
        
        const signals = ecgData.signal_data.signals;
        const time = ecgData.signal_data.time;
        
        console.log('Signal data:', signals);
        console.log('Time data length:', time.length);
        console.log('Number of signals:', signals.length);
        
        if (!signals || signals.length === 0) {
            throw new Error('No signal data found');
        }
        
        if (!time || time.length === 0) {
            throw new Error('No time data found');
        }
        
        // Data sampling - if too many data points, sample them
        const maxPoints = 5000; // Maximum display points
        let sampledTime = time;
        let sampledSignals = signals;
        
        if (time.length > maxPoints) {
            const step = Math.floor(time.length / maxPoints);
            sampledTime = time.filter((_, index) => index % step === 0);
            sampledSignals = signals.map(signal => ({
                ...signal,
                data: signal.data.filter((_, index) => index % step === 0)
            }));
            console.log(`Data sampling: reduced from ${time.length} to ${sampledTime.length} points`);
        }
        
        // Validate sampled data
        console.log('Sampled time length:', sampledTime.length);
        console.log('Sampled signal data:', sampledSignals.map(s => ({name: s.name, dataLength: s.data.length})));
        
        // Create Chart.js datasets
        const datasets = sampledSignals.map((signal, index) => {
            console.log(`Creating dataset ${index}:`, signal.name, 'data length:', signal.data.length);
            
            return {
                label: signal.name,
                data: sampledTime.map((t, i) => ({
                    x: t,
                    y: signal.data[i]
                })),
                borderColor: getSignalColor(index),
                backgroundColor: getSignalColor(index) + '20',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1
            };
        });

        console.log('Number of datasets created:', datasets.length);
        console.log('First dataset example:', datasets[0]);

        // Create Chart.js configuration
        const canvas = document.getElementById('ecgChart');
        if (!canvas) {
            throw new Error('Canvas element not found');
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Cannot get canvas context');
        }
        
        if (ecgChart) {
            console.log('Destroying existing chart');
            ecgChart.destroy();
        }
        
        console.log('Creating new Chart.js chart...');
        ecgChart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    title: {
                        display: true,
                        text: `ECG Signal: ${ecgData.filename}`
                    },
                    legend: {
                        display: signals.length > 1,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            title: function(context) {
                                return `Time: ${context[0].parsed.x.toFixed(3)}s`;
                            },
                            label: function(context) {
                                return `${context.dataset.label}: ${context[0].parsed.y.toFixed(3)} mV`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Time (seconds)'
                        },
                        grid: {
                            color: '#f0f0f0'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Amplitude (mV)'
                        },
                        grid: {
                            color: '#f0f0f0'
                        }
                    }
                }
            }
        });
        
        console.log('Chart.js chart creation completed');
        
    } catch (error) {
        console.error('displayECGPlot error:', error);
        const plotContainer = document.getElementById('ecgPlotContainer');
        plotContainer.innerHTML = `<div class="error">Chart creation failed: ${error.message}</div>`;
    }
}

function setupChartControls(ecgData) {
    try {
        console.log('Setting up chart controls...');
        
        const controls = document.getElementById('chartControls');
        const leadSelector = document.getElementById('leadSelector');
        const timeWindow = document.getElementById('timeWindow');
        const startTime = document.getElementById('startTime');
        
        // Set up lead selector
        leadSelector.innerHTML = '<option value="all">All Leads</option>';
        ecgData.signal_data.signals.forEach((signal, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = signal.name;
            leadSelector.appendChild(option);
        });
        
        // Set up time window range
        const totalDuration = ecgData.signal_data.num_samples / ecgData.metadata.sampling_frequency;
        timeWindow.max = Math.min(60, Math.floor(totalDuration));
        timeWindow.value = Math.min(10, Math.floor(totalDuration));
        document.getElementById('timeWindowValue').textContent = timeWindow.value;
        
        // Set up start time range
        startTime.max = Math.floor(totalDuration - parseInt(timeWindow.value));
        startTime.value = 0;
        document.getElementById('startTimeValue').textContent = startTime.value;
        
        controls.style.display = 'block';
        console.log('Chart controls setup completed');
        
    } catch (error) {
        console.error('setupChartControls error:', error);
    }
}

function updateChart() {
    try {
        if (!globalECGData || !ecgChart) {
            console.log('Cannot update chart: missing data or chart instance');
            return;
        }
        
        const leadSelector = document.getElementById('leadSelector');
        const timeWindow = document.getElementById('timeWindow');
        const startTime = document.getElementById('startTime');
        
        const selectedLead = leadSelector.value;
        const windowSize = parseInt(timeWindow.value);
        const startTimeValue = parseInt(startTime.value);
        
        console.log('Updating chart parameters:', {selectedLead, windowSize, startTimeValue});
        
        // Update display values
        document.getElementById('timeWindowValue').textContent = windowSize;
        document.getElementById('startTimeValue').textContent = startTimeValue;
        
        // Calculate time range
        const endTime = startTimeValue + windowSize;
        const samplingFreq = globalECGData.metadata.sampling_frequency;
        const startIndex = Math.floor(startTimeValue * samplingFreq);
        const endIndex = Math.floor(endTime * samplingFreq);
        
        console.log('Calculated time range:', {startIndex, endIndex, startTimeValue, endTime});
        
        // Get data within time window
        const timeData = globalECGData.signal_data.time.slice(startIndex, endIndex);
        const signals = globalECGData.signal_data.signals;
        
        // Create new datasets
        const datasets = [];
        const signalsToShow = selectedLead === 'all' ? signals : [signals[parseInt(selectedLead)]];
        
        signalsToShow.forEach((signal, index) => {
            const signalData = signal.data.slice(startIndex, endIndex);
            datasets.push({
                label: signal.name,
                data: timeData.map((t, i) => ({
                    x: t,
                    y: signalData[i]
                })),
                borderColor: getSignalColor(selectedLead === 'all' ? index : parseInt(selectedLead)),
                backgroundColor: getSignalColor(selectedLead === 'all' ? index : parseInt(selectedLead)) + '20',
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1
            });
        });
        
        // Update chart data
        ecgChart.data.datasets = datasets;
        ecgChart.update('none');
        console.log('Chart update completed');
        
    } catch (error) {
        console.error('updateChart error:', error);
    }
}

function displayECGInfo(ecgData) {
    try {
        console.log('displayECGInfo called with data:', ecgData);
        
        const infoContainer = document.getElementById('ecgInfo');
        const detailsContainer = document.getElementById('ecgDetails');
        
        console.log('Found containers:', {
            infoContainer: !!infoContainer,
            detailsContainer: !!detailsContainer
        });
        
        if (!infoContainer || !detailsContainer) {
            console.error('Required containers not found');
            return;
        }
        
        const metadata = ecgData.metadata;
        const signalData = ecgData.signal_data;
        
        console.log('Metadata:', metadata);
        console.log('Signal data:', signalData);
        
        if (!metadata || !signalData) {
            console.error('Missing metadata or signal data');
            return;
        }
        
        if (!signalData.signals || !Array.isArray(signalData.signals)) {
            console.error('Invalid signal data structure');
            return;
        }
        
        let infoHTML = `
            <table style="width: 100%; margin-bottom: 15px;">
                <tr><td><strong>Record Name:</strong></td><td>${metadata.record_name || 'Unknown'}</td></tr>
                <tr><td><strong>Number of Signals:</strong></td><td>${metadata.num_signals || signalData.signals.length}</td></tr>
                <tr><td><strong>Sampling Frequency:</strong></td><td>${metadata.sampling_frequency || 'Unknown'} Hz</td></tr>
                <tr><td><strong>Record Duration:</strong></td><td>${signalData.num_samples && metadata.sampling_frequency ? (signalData.num_samples / metadata.sampling_frequency).toFixed(2) : 'Unknown'} seconds</td></tr>
                <tr><td><strong>Number of Samples:</strong></td><td>${signalData.num_samples ? signalData.num_samples.toLocaleString() : 'Unknown'}</td></tr>
            </table>
            
            <h5>Signal Information:</h5>
            <table style="width: 100%;">
                <thead>
                    <tr>
                        <th>Signal Name</th>
                        <th>Unit</th>
                        <th>Max Amplitude</th>
                        <th>Min Amplitude</th>
                        <th>Average Amplitude</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        // Limit the number of signals processed to avoid stack overflow
        const maxSignals = Math.min(signalData.signals.length, 10);
        console.log(`Processing ${maxSignals} signals out of ${signalData.signals.length} total`);
        
        for (let index = 0; index < maxSignals; index++) {
            const signal = signalData.signals[index];
            console.log(`Processing signal ${index}:`, signal);
            
            if (!signal || !signal.data || !Array.isArray(signal.data)) {
                console.warn(`Invalid signal data at index ${index}`);
                continue;
            }
            
            // Limit data amount to avoid stack overflow
            const data = signal.data;
            const maxDataPoints = 10000; // Limit number of data points
            const sampledData = data.length > maxDataPoints ? 
                data.filter((_, i) => i % Math.ceil(data.length / maxDataPoints) === 0) : 
                data;
            
            console.log(`Signal ${index} data length: ${data.length}, sampled to: ${sampledData.length}`);
            
            const maxVal = Math.max(...sampledData);
            const minVal = Math.min(...sampledData);
            const avgVal = sampledData.reduce((a, b) => a + b, 0) / sampledData.length;
            
            infoHTML += `
                <tr>
                    <td>${signal.name || `Signal_${index + 1}`}</td>
                    <td>${signal.unit || 'mV'}</td>
                    <td>${maxVal.toFixed(3)}</td>
                    <td>${minVal.toFixed(3)}</td>
                    <td>${avgVal.toFixed(3)}</td>
                </tr>
            `;
        }
        
        infoHTML += `
                </tbody>
            </table>
        `;
        
        console.log('Generated HTML length:', infoHTML.length);
        detailsContainer.innerHTML = infoHTML;
        infoContainer.style.display = 'block';
        console.log('ECG information display completed');
        
    } catch (error) {
        console.error('displayECGInfo error:', error);
        console.error('Error stack:', error.stack);
    }
}

function getSignalColor(index) {
    const colors = [
        '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
        '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
    ];
    return colors[index % colors.length];
}

// Original CSV processing functionality
function uploadCSV() {
    const fileInput = document.getElementById('csvFile');
    const files = fileInput.files;
    
    if (files.length === 0) {
        alert("Please select CSV files.");
        return;
    }

    // Clear previous data
    csvFilesData = [];
    document.getElementById('csvFilesContainer').innerHTML = '';

    // Process each file
    const uploadPromises = Array.from(files).map((file, index) => {
        const formData = new FormData();
        formData.append('file', file);

        return fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(resp => resp.json())
        .then(result => {
            if (result.error) {
                throw new Error(`File ${file.name}: ${result.error}`);
            }
            return {
                fileName: file.name,
                data: result.data,
                columnNames: result.column_names || {
                    title: 'title',
                    class: 'class',
                    value1: 'value1',
                    value2: 'value2',
                    value3: 'value3'
                }
            };
        });
    });

    // Wait for all uploads to complete
    Promise.all(uploadPromises)
        .then(results => {
            csvFilesData = results;
            displayAllCSVFiles();
        })
        .catch(error => {
            console.error("Upload failed:", error);
            alert("Upload failed: " + error.message);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, initializing empty plot...');
    initEmptyPlot();  // Initialize empty plot
});

function initEmptyPlot() {
    const container = document.getElementById("plotContainer");
    const layout = {
        width: container.clientWidth,
        height: container.clientHeight,
        ternary: {
            sum: 1,
            aaxis: { title: "v1", min: 0, showgrid: true },
            baxis: { title: "v2", min: 0, showgrid: true },
            caxis: { title: "v3", min: 0, showgrid: true }
        },
        title: 'Ternary Plot (Empty)',
        showlegend: false
    };

    // Key: add an invisible point to hold the plot
    const dummyTrace = {
        type: 'scatterternary',
        a: [1e-6],
        b: [1e-6],
        c: [1 - 2e-6],
        mode: 'markers',
        marker: { size: 1, color: 'rgba(0,0,0,0)' },  // Completely transparent
        hoverinfo: 'skip',
        showlegend: false
    };

    Plotly.newPlot('plotContainer', [dummyTrace], layout);
}

function displayAllCSVFiles() {
    const container = document.getElementById('csvFilesContainer');
    container.innerHTML = '';

    if (csvFilesData.length === 0) {
        container.innerHTML = '<p>No data to display</p>';
        return;
    }

    csvFilesData.forEach((fileData, fileIndex) => {
        const fileSection = document.createElement('div');
        fileSection.style.cssText = 'margin-bottom: 30px; border: 1px solid #ddd; border-radius: 8px; padding: 20px; background-color: #f9f9f9;';
        
        // File header
        const fileHeader = document.createElement('h4');
        fileHeader.style.cssText = 'margin: 0 0 15px 0; color: #333; border-bottom: 2px solid #007bff; padding-bottom: 5px;';
        fileHeader.textContent = `File: ${fileData.fileName}`;
        fileSection.appendChild(fileHeader);

        // Main layout: left-right structure for this file
        const layoutDiv = document.createElement('div');
        layoutDiv.style.cssText = 'display: flex; justify-content: space-between; gap: 20px;';
        
        // Left: Table
        const tableContainer = document.createElement('div');
        tableContainer.style.cssText = 'width: 48%; max-height: 600px; overflow-y: auto; border: 1px solid #ccc; background-color: white;';
        tableContainer.id = `tableContainer_${fileIndex}`;
        
        // Right: Style Controls and Ternary Plot
        const rightContainer = document.createElement('div');
        rightContainer.style.cssText = 'width: 48%; display: flex; flex-direction: column;';
        rightContainer.id = `rightContainer_${fileIndex}`;
        
        // Style Controls will be inserted here by setupStyleControlsForFile
        const styleControlsPlaceholder = document.createElement('div');
        styleControlsPlaceholder.id = `styleControlsPlaceholder_${fileIndex}`;
        rightContainer.appendChild(styleControlsPlaceholder);
        
        // Ternary Plot
        const plotContainer = document.createElement('div');
        plotContainer.style.cssText = 'flex: 1; border: 1px solid #ccc;';
        plotContainer.id = `plotContainer_${fileIndex}`;
        rightContainer.appendChild(plotContainer);
        
        // Add table and right container to layout
        layoutDiv.appendChild(tableContainer);
        layoutDiv.appendChild(rightContainer);
        fileSection.appendChild(layoutDiv);
        
        // Add to main container first
        container.appendChild(fileSection);
        
        // Display table and plot for this file
        displayTableForFile(fileData, fileIndex);
    });
}

function displayTableForFile(fileData, fileIndex) {
    const container = document.getElementById(`tableContainer_${fileIndex}`);
    
    if (!container) {
        console.error(`Table container not found for file index ${fileIndex}`);
        return;
    }
    
    const data = fileData.data;
    const columnNames = fileData.columnNames;
    
    if (data.length === 0) {
        container.innerHTML = '<p>No data to display</p>';
        return;
    }

    const table = document.createElement('table');
    table.style.cssText = 'width: 100%; border-collapse: collapse;';
    const header = table.insertRow();
    
    // Add checkbox column header
    const checkboxHeader = document.createElement('th');
    checkboxHeader.className = 'checkbox-column';
    checkboxHeader.innerHTML = `<input type="checkbox" id="selectAll_${fileIndex}" checked onchange="toggleAllRowsForFile(${fileIndex})">`;
    header.appendChild(checkboxHeader);
    
    // Create column mapping for display
    const displayColumnNames = [];
    const columnMapping = {};
    
    // Use actual column names from CSV
    displayColumnNames.push('title');
    displayColumnNames.push('class');
    displayColumnNames.push(columnNames.value1);
    displayColumnNames.push(columnNames.value2);
    displayColumnNames.push(columnNames.value3);
    
    // Create mapping from display names to internal names
    columnMapping['title'] = 'title';
    columnMapping['class'] = 'class';
    columnMapping[columnNames.value1] = 'value1';
    columnMapping[columnNames.value2] = 'value2';
    columnMapping[columnNames.value3] = 'value3';
    
    // Create table headers with actual column names
    displayColumnNames.forEach(displayName => {
        const th = document.createElement('th');
        th.innerText = displayName;
        header.appendChild(th);
    });

    data.forEach((row, index) => {
        const tr = table.insertRow();
        
        // Add checkbox cell
        const checkboxCell = tr.insertCell();
        checkboxCell.className = 'checkbox-column';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true; // Default checked
        checkbox.onchange = function() {
            updateTernaryPlotForFile(fileIndex);
            updateSelectionCountForFile(fileIndex);
        };
        checkboxCell.appendChild(checkbox);
        
        // Add data cells using the mapping
        displayColumnNames.forEach(displayName => {
            const td = tr.insertCell();
            const internalName = columnMapping[displayName];
            td.innerText = row[internalName] || '';
        });
    });

    container.appendChild(table);
    
    // Add control buttons
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'table-controls';
    controlsDiv.innerHTML = `
        <button class="btn" onclick="selectAllRowsForFile(${fileIndex})">Select All</button>
        <button class="btn" onclick="deselectAllRowsForFile(${fileIndex})">Deselect All</button>
        <span style="margin-left: 15px; font-size: 12px; color: #666;">
            Selected: <span id="selectedCount_${fileIndex}">${data.length}</span> / <span id="totalCount_${fileIndex}">${data.length}</span> points
        </span>
    `;
    container.appendChild(controlsDiv);
    
    // Update counts
    updateSelectionCountForFile(fileIndex);
    
    // Setup style controls for this file
    setupStyleControlsForFile(fileData, fileIndex);
    
    // Initialize plot for this file
    plotTernaryForFile(fileData, fileIndex);
}

function updateSelectionCountForFile(fileIndex) {
    const checkboxes = document.querySelectorAll(`#tableContainer_${fileIndex} table tbody input[type="checkbox"]`);
    const selectedCount = document.getElementById(`selectedCount_${fileIndex}`);
    const totalCount = document.getElementById(`totalCount_${fileIndex}`);
    
    if (selectedCount && totalCount) {
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        selectedCount.textContent = checkedCount;
        totalCount.textContent = checkboxes.length;
    } else {
        console.error(`Selection count elements not found for file index ${fileIndex}`);
    }
}

function updateSelectionCount() {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        updateSelectionCountForFile(0);
    }
}

function toggleAllRowsForFile(fileIndex) {
    const selectAllCheckbox = document.getElementById(`selectAll_${fileIndex}`);
    const checkboxes = document.querySelectorAll(`#tableContainer_${fileIndex} table tbody input[type="checkbox"]`);
    
    if (!selectAllCheckbox || checkboxes.length === 0) {
        console.error(`Checkboxes not found for file index ${fileIndex}`);
        return;
    }
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    
    updateTernaryPlotForFile(fileIndex);
    updateSelectionCountForFile(fileIndex);
}

function selectAllRowsForFile(fileIndex) {
    const checkboxes = document.querySelectorAll(`#tableContainer_${fileIndex} table tbody input[type="checkbox"]`);
    const selectAllCheckbox = document.getElementById(`selectAll_${fileIndex}`);
    
    if (!selectAllCheckbox || checkboxes.length === 0) {
        console.error(`Checkboxes not found for file index ${fileIndex}`);
        return;
    }
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    selectAllCheckbox.checked = true;
    updateTernaryPlotForFile(fileIndex);
    updateSelectionCountForFile(fileIndex);
}

function deselectAllRowsForFile(fileIndex) {
    const checkboxes = document.querySelectorAll(`#tableContainer_${fileIndex} table tbody input[type="checkbox"]`);
    const selectAllCheckbox = document.getElementById(`selectAll_${fileIndex}`);
    
    if (!selectAllCheckbox || checkboxes.length === 0) {
        console.error(`Checkboxes not found for file index ${fileIndex}`);
        return;
    }
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    selectAllCheckbox.checked = false;
    updateTernaryPlotForFile(fileIndex);
    updateSelectionCountForFile(fileIndex);
}

function toggleAllRows() {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        toggleAllRowsForFile(0);
    }
}

function selectAllRows() {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        selectAllRowsForFile(0);
    }
}

function deselectAllRows() {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        deselectAllRowsForFile(0);
    }
}

function updateTernaryPlotForFile(fileIndex) {
    if (!csvFilesData[fileIndex]) {
        console.error(`CSV file data not found for file index ${fileIndex}`);
        return;
    }
    
    // Get selected rows for this file
    const checkboxes = document.querySelectorAll(`#tableContainer_${fileIndex} table tbody input[type="checkbox"]`);
    const selectedData = [];
    
    checkboxes.forEach((checkbox, index) => {
        if (checkbox.checked && csvFilesData[fileIndex].data[index]) {
            selectedData.push(csvFilesData[fileIndex].data[index]);
        }
    });
    
    plotTernaryForFile(csvFilesData[fileIndex], fileIndex, selectedData);
    updateSelectionCountForFile(fileIndex);
}

function updateTernaryPlot() {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        updateTernaryPlotForFile(0);
    }
}

function plotTernaryForFile(fileData, fileIndex, selectedData) {
    const plotDiv = document.getElementById(`plotContainer_${fileIndex}`);
    
    if (!plotDiv) {
        console.error(`Plot container not found for file index ${fileIndex}`);
        return;
    }
    
    if (!selectedData || selectedData.length === 0) {
        // Show empty plot if no data selected
        const layout = {
            width: plotDiv.clientWidth || 400,
            height: 400,
            ternary: {
                sum: 1,
                aaxis: { title: fileData.columnNames.value1, min: 0 },
                baxis: { title: fileData.columnNames.value2, min: 0 },
                caxis: { title: fileData.columnNames.value3, min: 0 }
            },
            title: 'Ternary Plot (No Data Selected)',
            showlegend: false,
            margin: { t: 50, b: 50, l: 50, r: 50 }
        };
        
        const dummyTrace = {
            type: 'scatterternary',
            a: [1e-6],
            b: [1e-6],
            c: [1 - 2e-6],
            mode: 'markers',
            marker: { size: 1, color: 'rgba(0,0,0,0)' },
            hoverinfo: 'skip',
            showlegend: false
        };
        
        Plotly.newPlot(`plotContainer_${fileIndex}`, [dummyTrace], layout);
        return;
    }
    
    const classGroups = {};
    const plotWidth = plotDiv.clientWidth || 400;
    const plotHeight = 400;

    // Group data by class
    selectedData.forEach(row => {
        const v1 = parseFloat(row.value1);
        const v2 = parseFloat(row.value2);
        const v3 = parseFloat(row.value3);
        const total = v1 + v2 + v3;
        if (total === 0) return;

        const norm = {
            "a": v1 / total,
            "b": v2 / total,
            "c": v3 / total,
            "label": row.title || 'Untitled'
        };

        const className = row.class || 'Unknown';
        if (!classGroups[className]) {
            classGroups[className] = [];
        }
        classGroups[className].push(norm);
    });

    // Use custom styles for each class
    const traces = [];

    Object.keys(classGroups).forEach((className) => {
        const group = classGroups[className];
        const style = classStyles[className] || {
            color: '#1f77b4',
            symbol: 'circle',
            size: 8
        };
        
        traces.push({
            "type": 'scatterternary',
            "mode": 'markers',
            "name": className,
            "a": group.map(p => p.a),
            "b": group.map(p => p.b),
            "c": group.map(p => p.c),
            "text": group.map(p => p.label),
            "marker": {
                "symbol": style.symbol,
                "size": style.size,
                "color": style.color,
                "line": { "width": 1, "color": '#444' }
            }
        });
    });

    // Get actual column names for axis titles
    const axisTitles = {
        a: fileData.columnNames.value1,
        b: fileData.columnNames.value2,
        c: fileData.columnNames.value3
    };

    const layout = {
        width: plotWidth,
        height: plotHeight,
        ternary: {
            sum: 1,
            aaxis: { title: axisTitles.a, min: 0 },
            baxis: { title: axisTitles.b, min: 0 },
            caxis: { title: axisTitles.c, min: 0 }
        },
        title: `Ternary Plot by Class (${selectedData.length} points selected)`,
        legend: { title: { text: "Class" } },
        margin: { t: 50, b: 50, l: 50, r: 50 }
    };

    Plotly.newPlot(`plotContainer_${fileIndex}`, traces, layout);
}

function plotTernary(data) {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        plotTernaryForFile(csvFilesData[0], 0, data);
    }
}

// Style control functions
function setupStyleControlsForFile(fileData, fileIndex) {
    const data = fileData.data;
    
    // Get unique classes
    const classes = [...new Set(data.map(row => row.class || 'Unknown'))];
    
    // Initialize default styles for each class
    const defaultColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
    const defaultSymbols = ['circle', 'square', 'diamond', 'cross', 'x', 'star', 'triangle-up', 'triangle-down', 'triangle-left', 'triangle-right'];
    
    classes.forEach((className, index) => {
        if (!classStyles[className]) {
            classStyles[className] = {
                color: defaultColors[index % defaultColors.length],
                symbol: defaultSymbols[index % defaultSymbols.length],
                size: 8
            };
        }
    });
    
    // Create style controls container for this file
    const styleControlsPlaceholder = document.getElementById(`styleControlsPlaceholder_${fileIndex}`);
    if (!styleControlsPlaceholder) {
        console.error(`Style controls placeholder not found for file index ${fileIndex}`);
        return;
    }
    
    const styleControlsDiv = document.createElement('div');
    styleControlsDiv.className = 'chart-controls';
    styleControlsDiv.style.cssText = 'margin-bottom: 10px;';
    styleControlsDiv.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #333;">Plot Style Controls</h4>
        <div id="classStyleControls_${fileIndex}">
            <!-- Class selector and style controls will be generated here -->
        </div>
        <div style="margin-top: 10px;">
            <button class="btn" onclick="updateTernaryPlotForFile(${fileIndex}); updateSelectionCountForFile(${fileIndex});">Apply Styles</button>
            <button class="btn" onclick="resetAllStylesForFile(${fileIndex})" style="background-color: #6c757d;">Reset Styles</button>
        </div>
    `;
    
    // Replace the placeholder with style controls
    styleControlsPlaceholder.parentNode.replaceChild(styleControlsDiv, styleControlsPlaceholder);
    
    // Generate style controls
    const classStyleControls = document.getElementById(`classStyleControls_${fileIndex}`);
    
    // First row: Class selector
    const classSelectorDiv = document.createElement('div');
    classSelectorDiv.style.cssText = 'margin-bottom: 10px; padding: 8px; background-color: #f8f9fa; border-radius: 4px;';
    classSelectorDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <label style="font-size: 12px; font-weight: bold;">Class:</label>
            <select id="classSelector_${fileIndex}" onchange="updateStyleControlsForFile(${fileIndex})" style="padding: 4px; font-size: 12px; width: 120px;">
                ${classes.map(className => `<option value="${className}">${className}</option>`).join('')}
            </select>
        </div>
    `;
    classStyleControls.appendChild(classSelectorDiv);
    
    // Second row: Style controls (will be updated based on selected class)
    const styleControlsContentDiv = document.createElement('div');
    styleControlsContentDiv.id = `styleControlsContent_${fileIndex}`;
    styleControlsContentDiv.style.cssText = 'padding: 8px; background-color: #f8f9fa; border-radius: 4px;';
    classStyleControls.appendChild(styleControlsContentDiv);
    
    // Initialize with first class
    updateStyleControlsForFile(fileIndex);
}

function setupStyleControls(data) {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        setupStyleControlsForFile(csvFilesData[0], 0);
    }
}

function updateStyleControlsForFile(fileIndex) {
    const classSelector = document.getElementById(`classSelector_${fileIndex}`);
    const styleControlsContent = document.getElementById(`styleControlsContent_${fileIndex}`);
    
    if (!classSelector || !styleControlsContent) {
        console.error(`Style controls not found for file index ${fileIndex}`);
        return;
    }
    
    const selectedClass = classSelector.value;
    const style = classStyles[selectedClass] || {
        color: '#1f77b4',
        symbol: 'circle',
        size: 8
    };
    
    styleControlsContent.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 12px; font-weight: bold;">Color:</label>
                <input type="color" value="${style.color}" 
                       onchange="updateClassStyle('${selectedClass}', 'color', this.value)" 
                       style="width: 35px; height: 25px; border: none; cursor: pointer;">
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 12px; font-weight: bold;">Symbol:</label>
                <select onchange="updateClassStyle('${selectedClass}', 'symbol', this.value)" 
                        style="padding: 3px; font-size: 12px; width: 100px;">
                    <option value="circle" ${style.symbol === 'circle' ? 'selected' : ''}>Circle</option>
                    <option value="square" ${style.symbol === 'square' ? 'selected' : ''}>Square</option>
                    <option value="diamond" ${style.symbol === 'diamond' ? 'selected' : ''}>Diamond</option>
                    <option value="cross" ${style.symbol === 'cross' ? 'selected' : ''}>Cross</option>
                    <option value="x" ${style.symbol === 'x' ? 'selected' : ''}>X</option>
                    <option value="star" ${style.symbol === 'star' ? 'selected' : ''}>Star</option>
                    <option value="triangle-up" ${style.symbol === 'triangle-up' ? 'selected' : ''}>Triangle Up</option>
                    <option value="triangle-down" ${style.symbol === 'triangle-down' ? 'selected' : ''}>Triangle Down</option>
                    <option value="triangle-left" ${style.symbol === 'triangle-left' ? 'selected' : ''}>Triangle Left</option>
                    <option value="triangle-right" ${style.symbol === 'triangle-right' ? 'selected' : ''}>Triangle Right</option>
                </select>
            </div>
            
            <div style="display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 12px; font-weight: bold;">Size:</label>
                <input type="range" min="4" max="20" value="${style.size}" 
                       onchange="updateClassStyle('${selectedClass}', 'size', parseInt(this.value))" 
                       style="width: 80px;">
                <span style="font-size: 12px; color: #666; min-width: 25px; font-weight: bold;">${style.size}</span>
            </div>
        </div>
    `;
}

function updateStyleControls() {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        updateStyleControlsForFile(0);
    }
}

function updateClassStyle(className, property, value) {
    if (!classStyles[className]) {
        classStyles[className] = {};
    }
    classStyles[className][property] = value;
    
    // Update the size display
    if (property === 'size') {
        const sizeSpan = event.target.parentElement.parentElement.querySelector('span');
        if (sizeSpan) {
            sizeSpan.textContent = value;
        }
    }
    
    // Update the style controls to reflect the change
    updateStyleControls();
}

function resetAllStylesForFile(fileIndex) {
    const defaultColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
    const defaultSymbols = ['circle', 'square', 'diamond', 'cross', 'x', 'star', 'triangle-up', 'triangle-down', 'triangle-left', 'triangle-right'];
    
    if (csvFilesData[fileIndex]) {
        const classes = [...new Set(csvFilesData[fileIndex].data.map(row => row.class || 'Unknown'))];
        classes.forEach((className, index) => {
            classStyles[className] = {
                color: defaultColors[index % defaultColors.length],
                symbol: defaultSymbols[index % defaultSymbols.length],
                size: 8
            };
        });
        
        setupStyleControlsForFile(csvFilesData[fileIndex], fileIndex);
        updateTernaryPlotForFile(fileIndex);
    }
}

function resetAllStyles() {
    // Legacy function for backward compatibility
    if (csvFilesData.length === 1) {
        resetAllStylesForFile(0);
    }
}

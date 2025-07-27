def validate_csv(fieldnames):
    """
    Validate CSV file format.
    Requires 'title' and 'class' columns (case insensitive).
    Requires exactly 3 additional numeric columns for values.
    """
    if fieldnames is None:
        # No header row, will use default column names
        return True
    
    fieldnames_lower = [f.lower() for f in fieldnames]
    
    # Check if required columns exist (case insensitive)
    required_columns = ['title', 'class']
    for required_col in required_columns:
        if required_col not in fieldnames_lower:
            return False
    
    # Check if we have exactly 5 columns total (title, class + 3 value columns)
    if len(fieldnames) != 5:
        return False
    
    return True

def get_column_mapping(fieldnames):
    """
    Get mapping between CSV column names and expected column names.
    Returns a dictionary mapping expected column names to actual CSV column names.
    """
    if fieldnames is None:
        # No header, use default column names
        return {
            'title': 'title',
            'class': 'class', 
            'value1': 'value1',
            'value2': 'value2',
            'value3': 'value3'
        }
    
    fieldnames_lower = [f.lower() for f in fieldnames]
    mapping = {}
    
    # Map required columns (title, class)
    required_columns = ['title', 'class']
    for required_col in required_columns:
        if required_col in fieldnames_lower:
            # Find the original column name (preserving case)
            idx = fieldnames_lower.index(required_col)
            mapping[required_col] = fieldnames[idx]
    
    # Map value columns (can be any names)
    value_columns = []
    for i, col in enumerate(fieldnames):
        col_lower = col.lower()
        if col_lower not in ['title', 'class']:
            value_columns.append(col)
    
    # Map value columns to value1, value2, value3
    for i, value_col in enumerate(value_columns):
        mapping[f'value{i+1}'] = value_col
    
    return mapping

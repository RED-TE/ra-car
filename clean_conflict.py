
import sys
import os

def clean_conflict(filepath, keep_version='head'):
    if not os.path.exists(filepath):
        print(f"File {filepath} not found")
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    output = []
    in_head = False
    in_incoming = False
    
    # Simple state machine to handle one level of conflict
    skip_current = False
    
    for line in lines:
        if line.startswith('<<<<<<<'):
            in_head = True
            continue
        elif line.startswith('======='):
            in_head = False
            in_incoming = True
            continue
        elif line.startswith('>>>>>>>'):
            in_incoming = False
            continue
        
        if in_head:
            if keep_version == 'head':
                output.append(line)
        elif in_incoming:
            if keep_version == 'incoming':
                output.append(line)
        else:
            output.append(line)
            
    with open(filepath, 'w', encoding='utf-8', newline='') as f:
        f.writelines(output)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python clean_conflict.py <filepath> [head|incoming]")
    else:
        target = sys.argv[1]
        version = sys.argv[2] if len(sys.argv) > 2 else 'head'
        clean_conflict(target, version)

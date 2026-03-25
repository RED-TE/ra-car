
import sys
import os

def solve_car():
    path = 'car.html'
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    # Keep lines 1 to 1276 (index 0 to 1275)
    # Actually if index 0 is <!DOCTYPE html>, then up to 1274 (which was 1276)
    new_lines = lines[0:1275]
    if not new_lines[-1].strip().endswith('</html>'):
        new_lines.append('</html>\n')
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.writelines(new_lines)

def solve_business():
    path = 'business.html'
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    # Line 1: <<<<<<< HEAD <!DOCTYPE html> -> need to fix this
    # Version 1 ends at line 513
    first_line = lines[0]
    if '<<<<<<< HEAD' in first_line:
        lines[0] = first_line.replace('<<<<<<< HEAD', '').strip() + '\n'
    
    new_lines = lines[0:513]
    if not new_lines[-1].strip().endswith('</html>'):
        new_lines.append('</html>\n')
        
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.writelines(new_lines)

if __name__ == "__main__":
    solve_car()
    solve_business()

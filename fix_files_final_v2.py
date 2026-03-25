import os

def fix_file(filename, limit, end_tag='</html>'):
    if not os.path.exists(filename):
        print(f"File {filename} not found")
        return
    
    with open(filename, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    # Check if file needs fixing (contains conflict markers)
    content_str = "".join(lines)
    if '=======' not in content_str and len(lines) <= limit + 5:
        print(f"File {filename} seems okay.")
        # Even if okay, we might need price update, but let's handle truncation first.
    
    fixed_lines = lines[:limit]
    with open(filename, 'w', encoding='utf-8') as f:
        f.writelines(fixed_lines)
        if not fixed_lines[-1].strip().endswith(end_tag):
            f.write(f'\n{end_tag}\n')
    print(f"Fixed {filename} to {limit} lines.")

fix_file('car.html', 1275)
fix_file('business.html', 512)
fix_file('blogbot.html', 1406) # Just to be safe, though blogbot is likely fine

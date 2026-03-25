import os
try:
    with open('car.html', 'r+', encoding='utf-8') as f:
        content = f.read()
        pos = content.find('</html>')
        if pos != -1:
            f.seek(pos + 7)
            f.truncate()
            print(f"Successfully truncated car.html at position {pos+7}")
        else:
            print("</html> not found in car.html")
except Exception as e:
    print(f"Error: {e}")

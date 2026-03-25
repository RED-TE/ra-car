
import os

def fix_car():
    with open('car.html', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    # We want up to line 1275 (index 1274) which is </body>
    # After that we want </html>
    # Currently index 1274 is </body>, index 1275 is empty, index 1276 is =======
    result = lines[0:1275]
    result.append('</html>\n')
    with open('car.html.tmp', 'w', encoding='utf-8') as f:
        f.writelines(result)
    os.replace('car.html.tmp', 'car.html')

def fix_business():
    with open('business.html', 'r', encoding='utf-8') as f:
        lines = f.readlines()
    # Line 1 might have <<<<<<< HEAD
    if '<<<<<<< HEAD' in lines[0]:
        lines[0] = lines[0].replace('<<<<<<< HEAD', '').strip() + '\n'
    # Up to line 513
    result = lines[0:513]
    if not result[-1].strip().endswith('</html>'):
        result.append('</html>\n')
    with open('business.html.tmp', 'w', encoding='utf-8') as f:
        f.writelines(result)
    os.replace('business.html.tmp', 'business.html')

if __name__ == "__main__":
    fix_car()
    fix_business()
    print("DONE")

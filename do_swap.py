import os

# Root directory
root = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\gudok_PG'

def swap():
    index_path = os.path.join(root, 'index.html')
    landing_path = os.path.join(root, 'landing.html')
    blogbot_path = os.path.join(root, 'blogbot.html')

    try:
        # 1. Read index.html
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                index_content = f.read()
            
            # 2. Write to blogbot.html
            with open(blogbot_path, 'w', encoding='utf-8') as f:
                f.write(index_content)
            print(f"Created {blogbot_path}")

        # 3. Read landing.html
        if os.path.exists(landing_path):
            with open(landing_path, 'r', encoding='utf-8') as f:
                landing_content = f.read()
            
            # 4. Write to index.html (Overwrite)
            with open(index_path, 'w', encoding='utf-8') as f:
                f.write(landing_content)
            print(f"Updated {index_path} with landing content")

        # 5. Optional: delete landing.html or move it? 
        # The user said "메인페이지를 landing.html 얘로 해주고", so landing.html as a file might still be expected to exist or deleted.
        # But usually it's better to just leave it or rename it.
        # Given "메인페이지를 landing.html 얘로 해주고", it usually means index.html = landing.html.

    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    swap()

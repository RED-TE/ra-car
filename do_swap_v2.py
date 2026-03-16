import os
import shutil

root = r'c:\Users\jhxox\Desktop\sales_progerm\inphoto\gudok_PG'
index_path = os.path.join(root, 'index.html')
landing_path = os.path.join(root, 'landing.html')
blogbot_path = os.path.join(root, 'blogbot.html')
log_path = os.path.join(root, 'swap_log.txt')

with open(log_path, 'w') as log:
    try:
        log.write(f"Starting swap...\n")
        
        # 1. Copy index.html to blogbot.html
        if os.path.exists(index_path):
            shutil.copy2(index_path, blogbot_path)
            log.write(f"Copied index.html to blogbot.html\n")
        else:
            log.write(f"index.html not found at {index_path}\n")

        # 2. Copy landing.html to index.html
        if os.path.exists(landing_path):
            shutil.copy2(landing_path, index_path)
            log.write(f"Copied landing.html to index.html\n")
        else:
            log.write(f"landing.html not found at {landing_path}\n")
            
        log.write("Swap completed successfully.\n")
    except Exception as e:
        log.write(f"Error occurred: {e}\n")

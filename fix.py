import os

file_path = r"c:\Users\jhxox\Desktop\sales_progerm\inphoto\gudok_PG\index.html"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    line_num = i + 1
    if 1 <= line_num <= 720:
        continue
    if 988 <= line_num <= 1709:
        continue
    if 2323 <= line_num <= 2325:
        continue
    new_lines.append(line)

with open(file_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Done")

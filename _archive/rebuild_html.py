# -*- coding: utf-8 -*-

# Read the corrupted backup and try to decode properly
with open('index_corrupted_backup.html', 'rb') as f:
    raw_bytes = f.read()

# Try to detect actual encoding
try:
    # Try UTF-8
    content = raw_bytes.decode('utf-8')
except:
    try:
        # Try Windows-1252
        content = raw_bytes.decode('cp1252')
    except:
        # Last resort - latin1
        content = raw_bytes.decode('latin1')

# Now write with proper UTF-8, converting Vietnamese to ASCII-safe
vietnamese_map = {
    'Cài Đặt': 'Cai Dat',
    'Phím Bấm': 'Phim Bam',
    'Nút nổi': 'Nut noi',
    'Chế độ': 'Che do',
    'Chỉnh sửa': 'Chinh sua',
}

for vn, ascii_ver in vietnamese_map.items():
    content = content.replace(vn, ascii_ver)

# Replace all remaining Vietnamese characters
import unicodedata
output = []
for char in content:
    if ord(char) > 127:  # Non-ASCII
        # Try to get ASCII equivalent
        try:
            normalized = unicodedata.normalize('NFKD', char)
            ascii_char = ''.join([c for c in normalized if ord(c) < 128])
            output.append(ascii_char if ascii_char else '?')
        except:
            output.append('?')
    else:
        output.append(char)

result = ''.join(output)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(result)

print("Rebuilt HTML with ASCII-safe characters!")

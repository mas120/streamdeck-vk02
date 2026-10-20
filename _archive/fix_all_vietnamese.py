# -*- coding: utf-8 -*-
import sys

# Read with UTF-8
with open('index.html', 'r', encoding='utf-8-sig') as f:
    lines = f.readlines()

# Find and replace all Vietnamese text with ASCII-safe versions
replacements = {
    'Cài Đặt': 'Cai Dat',
    'Phím Bấm': 'Phim Bam',
    'Nút nổi': 'Nut noi',
    'Chế độ': 'Che do',
    'Chỉnh sửa': 'Chinh sua',
    'để thoát': 'de thoat',
    'Biểu tượng': 'Bieu tuong',
    'tên file': 'ten file',
    'Nhãn hiển thị': 'Nhan hien thi',
    'Hành động': 'Hanh dong',
    'Đường dẫn': 'Duong dan',
    'Thời lượng': 'Thoi luong',
    'Toạ độ': 'Toa do',
    'Tên thành phố': 'Ten thanh pho',
    'Độ sáng': 'Do sang',
    'màn hình': 'man hinh',
    'Tự tối': 'Tu toi',
    'Đặt lại': 'Dat lai',
    'bố cục': 'bo cuc',
}

# Also handle already corrupted text
corrupted_replacements = {
    'CÃ i Äáº·t': 'Cai Dat',
    'CÃƒÂ i Ã„ÂÃ¡ÂºÂ·t': 'Cai Dat',
    'PhÃ­m Báº¥m': 'Phim Bam',
    'PhÃƒÂ­m BÃ¡ÂºÂ¥m': 'Phim Bam',
    'NÃºt ná»•i': 'Nut noi',
    'Cháº¿ Ä'á»™': 'Che do',
    'Chá»‰nh sá»­a': 'Chinh sua',
    'Ä'á»ƒ thoÃ¡t': 'de thoat',
    'Biá»ƒu tÆ°á»£ng': 'Bieu tuong',
    'tÃªn file': 'ten file',
}

# Apply replacements
for i, line in enumerate(lines):
    for old, new in replacements.items():
        line = line.replace(old, new)
    for old, new in corrupted_replacements.items():
        line = line.replace(old, new)
    lines[i] = line

# Write back
with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fixed all Vietnamese text!")

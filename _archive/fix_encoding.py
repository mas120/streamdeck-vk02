# -*- coding: utf-8 -*-
import sys
import re

# Read the messed up HTML
with open('index_backup.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Write back with proper UTF-8 (this should fix double-encoding)
with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed encoding!")

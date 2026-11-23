"""Пересборка справочника клинических протоколов МЗ РУз из PDF в папке guidelines/.

Запуск из корня проекта:  python scripts/guidelines/run.py
Нужен Python 3.10+ и пакет pdfplumber:  pip install pdfplumber

1) grid.py   — извлекает таблицы стандартов по границам ячеек (grids/*.json);
2) parse.py  — выделяет «Лечебные» и «Диагностические мероприятия» (parsed.json);
3) build_data.py — сводит по нозологиям (список N: коды МКБ-10, файл протокола, страница раздела «Лечение»)
   и пишет src/data/guidelines.json и src/data/guidelineIcd.ts.
Новую нозологию добавляйте в список N в build_data.py. После пересборки: npm run build.
"""
import os, re, subprocess, sys
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
HERE = os.path.dirname(os.path.abspath(__file__))
G = os.path.abspath(os.path.join(HERE, '..', '..', 'guidelines'))
os.makedirs(os.path.join(HERE, 'grids'), exist_ok=True)
for f in sorted(os.listdir(G)):
    if f.lower().endswith('.pdf') and re.search(r'стандарт|КС ОК', f, re.I):
        print('таблицы:', f)
        subprocess.run([sys.executable, os.path.join(HERE, 'grid.py'), os.path.join(G, f), os.path.join(HERE, 'grids', f[:-4] + '.json')], check=True)
subprocess.run([sys.executable, os.path.join(HERE, 'parse.py')], check=True)
subprocess.run([sys.executable, os.path.join(HERE, 'build_data.py')], check=True)
print('Готово: src/data/guidelines.json')

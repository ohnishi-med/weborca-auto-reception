# anonymize.py
# -*- coding: utf-8 -*-
import os

def anonymize_file(filepath, replacements):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
        
    print(f"Anonymizing {filepath}...")
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    for target, replacement in replacements.items():
        content = content.replace(target, replacement)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Anonymized {filepath} successfully.")

# Reception.html の置換
reception_path = r"c:\Users\coino\AntigravityWorkspace\projects\tools\weborca-auto-reception\Reception.html"
reception_replacements = {
    "佐藤　芳美": "佐藤　太郎",
    "サトウ　ヨシミ": "サトウ　タロウ",
    "古暮　ふさ": "古暮　花子",
    "コグレ　フサ": "コグレ　ハナコ",
    "福田　真理絵": "福田　二郎",
    "フクダ　マリエ": "フクダ　ジロウ",
    "コウノ　マルティナ　アリゴレー": "コウノ　マルティナ",
    "ＫＯＮＯ　ＭＡＲＴＩＮＡ　ＡＲＩＧＯＲＥ": "ＫＯＮＯ　ＭＡＲＴＩＮＡ"
}
anonymize_file(reception_path, reception_replacements)

# karte.html の置換
karte_path = r"c:\Users\coino\AntigravityWorkspace\projects\tools\weborca-auto-reception\karte.html"
karte_replacements = {
    "山本　美香": "山本　梅子",
    "ヤマモト　ミカ": "ヤマモト　ウメコ"
}
anonymize_file(karte_path, karte_replacements)

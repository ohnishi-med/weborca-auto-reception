# test_api.py
# -*- coding: utf-8 -*-
import urllib.request
import json

GAS_URL = "https://script.google.com/macros/s/AKfycbypIiNLtxLDqVLFMt4A6-wf-_qy5tTun7sybU7Exe0NVvySMgnuUkukF7xbvOqBWd-TIA/exec"

def test_api(day, cool, date):
    url = f"{GAS_URL}?day={urllib.parse.quote(day)}&cool={cool}&date={date}"
    print(f"Requesting: {url}")
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode('utf-8'))
            print("Status:", data.get("status"))
            patients = data.get("patients", [])
            print(f"Retrieved {len(patients)} patients.")
            if patients:
                print("First patient data sample:")
                print(json.dumps(patients[0], indent=2, ensure_ascii=False))
            else:
                print("No patients match these query criteria.")
    except Exception as e:
        print("Error:", e)

# テスト1: 第1月曜日 (2026年6月1日)
print("--- TEST 1: 第1月曜日 (20260601) ---")
test_api("月", "all", "20260601")

# テスト2: 通常の金曜日 (2026年6月5日)
print("\n--- TEST 2: 通常の金曜日 (20260605) ---")
test_api("金", "all", "20260605")

# テスト3: 第1土曜日 (2026年6月6日)
print("\n--- TEST 3: 第1土曜日 (20260606) ---")
test_api("土", "all", "20260606")

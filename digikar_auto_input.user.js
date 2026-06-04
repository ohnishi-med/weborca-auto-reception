// ==UserScript==
// @name         M3デジカル 受付画面起点・自動セット入力ツール
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  デジカル受付画面から透析患者カルテへ順次遷移し、セット適用・一時保存・帰還を自動ループ処理します
// @author       Antigravity
// @match        https://*.digikar.jp/reception/*
// @match        https://*.digikar.jp/karte/*
// @match        https://*.digikar.jp/patients/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      script.google.com
// @connect      googleusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log("Digikar Auto Input Loop Script Loaded");

    // ================= 設定エリア =================
    // GAS APIのWebアプリURL（WebORCA自動受付と共通）
    const GAS_API_URL = "https://script.google.com/macros/s/AKfycbypIiNLtxLDqVLFMt4A6-wf-_qy5tTun7sybU7Exe0NVvySMgnuUkukF7xbvOqBWd-TIA/exec";
    
    // 各操作のウェイト時間（ミリ秒）
    const WAIT_MS = 1500;
    
    // カルテ保存の処理種別 ("送信" または "一時保存" または "保存")
    const SAVE_TYPE = "送信";
    // =============================================

    // セッションキーの定義
    const KEY_ACTIVE = 'digikar_auto_active';
    const KEY_PATIENTS = 'digikar_auto_patients';
    const KEY_INDEX = 'digikar_auto_index';
    const KEY_RECEPTION_URL = 'digikar_auto_reception_url';
    const KEY_LOG = 'digikar_auto_log';

    // CSSのインジェクション (Glassmorphism + ミントグリーン)
    const style = document.createElement('style');
    style.innerHTML = `
        #digikar-auto-panel {
            position: fixed;
            top: 15px;
            right: 15px;
            width: 280px;
            padding: 16px;
            background: rgba(240, 253, 250, 0.85);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(204, 251, 241, 0.6);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 999999;
            font-family: sans-serif;
            font-size: 13px;
            color: #0f172a;
        }
        #digikar-auto-panel h4 {
            margin: 0 0 10px 0;
            color: #0f766e;
            font-size: 14px;
            border-bottom: 2px solid rgba(13, 148, 136, 0.2);
            padding-bottom: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .digikar-btn-primary {
            width: 100%;
            padding: 8px;
            background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 6px;
            box-shadow: 0 3px 6px rgba(13, 148, 136, 0.2);
            transition: all 0.2s;
        }
        .digikar-btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 5px 12px rgba(13, 148, 136, 0.3);
        }
        .digikar-btn-secondary {
            width: 100%;
            padding: 8px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
            margin-top: 6px;
            display: none;
            transition: all 0.2s;
        }
        .digikar-settings-toggle {
            display: inline-block;
            margin-top: 8px;
            font-size: 11px;
            color: #0d9488;
            cursor: pointer;
            text-decoration: underline;
            transition: color 0.2s;
        }
        .digikar-settings-toggle:hover {
            color: #0f766e;
        }
        .digikar-settings-area {
            margin-top: 8px;
            padding: 10px;
            background: rgba(13, 148, 136, 0.05);
            border: 1px solid rgba(13, 148, 136, 0.15);
            border-radius: 8px;
            text-align: left;
        }
        .digikar-input-group {
            margin-bottom: 6px;
        }
        .digikar-input-group label {
            display: block;
            font-size: 11px;
            font-weight: bold;
            color: #0f766e;
            margin-bottom: 3px;
        }
        .digikar-input-text {
            width: 100%;
            padding: 5px 8px;
            box-sizing: border-box;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            font-size: 12px;
            color: #334155;
            background: white;
            outline: none;
            transition: border-color 0.2s;
        }
        .digikar-input-text:focus {
            border-color: #0d9488;
        }
        #digikar-auto-status {
            margin-top: 8px;
            padding: 6px;
            background: rgba(15, 23, 42, 0.05);
            border-radius: 6px;
            font-size: 11px;
            color: #334155;
            max-height: 80px;
            overflow-y: auto;
            white-space: pre-wrap;
            font-family: monospace;
        }
        .digikar-panel-btn {
            cursor: pointer;
            font-size: 11px;
            color: #64748b;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 18px;
            height: 18px;
            border-radius: 4px;
        }
        .digikar-panel-btn:hover {
            background: rgba(15, 23, 42, 0.08);
            color: #0f766e;
        }
        #digikar-auto-close:hover {
            background: rgba(239, 68, 68, 0.1);
            color: #ef4444;
        }
    `;
    document.head.appendChild(style);

    // ヘルパー: React入力値反映
    function setNativeValue(element, value) {
        if (value === undefined || value === null) return;
        const { set: valueSetter } = Object.getOwnPropertyDescriptor(element, 'value') || {};
        const prototype = Object.getPrototypeOf(element);
        const { set: prototypeValueSetter } = Object.getOwnPropertyDescriptor(prototype, 'value') || {};
        if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
            prototypeValueSetter.call(element, value);
        } else if (valueSetter) {
            valueSetter.call(element, value);
        } else {
            element.value = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForElement(selector, timeout = 12000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(250);
        }
        return null;
    }

    class DigikarAutoInputLoop {
        constructor() {
            this.panel = null;
            this.statusEl = null;
            this.startBtn = null;
            this.stopBtn = null;

            this.isActive = sessionStorage.getItem(KEY_ACTIVE) === 'true';
            this.patients = JSON.parse(sessionStorage.getItem(KEY_PATIENTS) || '[]');
            this.currentIndex = parseInt(sessionStorage.getItem(KEY_INDEX) || '0');

            this.initUI();
            this.checkCurrentPage();
        }

        initUI() {
            if (document.getElementById('digikar-auto-panel')) return;

            const div = document.createElement('div');
            div.id = 'digikar-auto-panel';
            div.innerHTML = `
                <h4 style="user-select: none;">
                    <span>🤖 一括セット入力</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size:10px; color:#64748b;" id="digikar-panel-indicator">待機中</span>
                        <span class="digikar-panel-btn" id="digikar-auto-minimize" title="最小化" style="font-weight:bold;">➖</span>
                        <span class="digikar-panel-btn" id="digikar-auto-close" title="閉じる" style="font-weight:bold;">✖</span>
                    </div>
                </h4>
                <div id="digikar-auto-content">
                    <div id="digikar-control-area">
                        <button class="digikar-btn-primary" id="digikar-auto-start">一括処理を開始</button>
                        <button class="digikar-btn-secondary" id="digikar-auto-stop">一時停止</button>
                    </div>
                    <div style="text-align: right;">
                        <span class="digikar-settings-toggle" id="digikar-auto-settings-toggle">⚙️ フォルダ設定</span>
                    </div>
                    <div class="digikar-settings-area" id="digikar-auto-settings-area" style="display: none;">
                        <div class="digikar-input-group">
                            <label>セットフォルダ名:</label>
                            <input type="text" class="digikar-input-text" id="digikar-auto-folder-name" placeholder="透析回診">
                        </div>
                        <button class="digikar-btn-primary" id="digikar-auto-save-settings" style="margin-top: 4px; padding: 5px; font-size: 11px;">設定を保存</button>
                    </div>
                    <div id="digikar-auto-status">ログ: 待機中...</div>
                </div>
            `;
            document.body.appendChild(div);

            this.panel = div;
            this.statusEl = div.querySelector('#digikar-auto-status');
            this.startBtn = div.querySelector('#digikar-auto-start');
            this.stopBtn = div.querySelector('#digikar-auto-stop');

            const settingsToggle = div.querySelector('#digikar-auto-settings-toggle');
            const settingsArea = div.querySelector('#digikar-auto-settings-area');
            const folderInput = div.querySelector('#digikar-auto-folder-name');
            const saveSettingsBtn = div.querySelector('#digikar-auto-save-settings');

            const minimizeBtn = div.querySelector('#digikar-auto-minimize');
            const closeBtn = div.querySelector('#digikar-auto-close');
            const contentArea = div.querySelector('#digikar-auto-content');

            // 最小化状態の復元 (sessionStorageに保存)
            const isMinimized = sessionStorage.getItem('digikar_panel_minimized') === 'true';
            if (isMinimized) {
                contentArea.style.display = 'none';
                minimizeBtn.innerText = '➕';
                minimizeBtn.title = '元に戻す';
            }

            // 閉じた状態の復元 (sessionStorageに保存)
            const isClosed = sessionStorage.getItem('digikar_panel_closed') === 'true';
            if (isClosed) {
                div.style.display = 'none';
            }

            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const hidden = contentArea.style.display === 'none';
                if (hidden) {
                    contentArea.style.display = 'block';
                    minimizeBtn.innerText = '➖';
                    minimizeBtn.title = '最小化';
                    sessionStorage.setItem('digikar_panel_minimized', 'false');
                } else {
                    contentArea.style.display = 'none';
                    minimizeBtn.innerText = '➕';
                    minimizeBtn.title = '元に戻す';
                    sessionStorage.setItem('digikar_panel_minimized', 'true');
                }
            });

            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm("一括セット入力パネルを閉じますか？（ページを再読み込みすると再度表示されます）")) {
                    div.style.display = 'none';
                    sessionStorage.setItem('digikar_panel_closed', 'true');
                }
            });

            // 保存されている値を取得して設定
            const savedFolder = GM_getValue('digikar_folder_name', '透析回診');
            folderInput.value = savedFolder;

            settingsToggle.addEventListener('click', () => {
                const isHidden = settingsArea.style.display === 'none';
                settingsArea.style.display = isHidden ? 'block' : 'none';
            });

            saveSettingsBtn.addEventListener('click', () => {
                const val = folderInput.value.trim();
                if (val) {
                    GM_setValue('digikar_folder_name', val);
                    this.log(`フォルダ名を「${val}」に保存しました。`);
                    settingsArea.style.display = 'none';
                } else {
                    alert("フォルダ名を入力してください。");
                }
            });

            this.startBtn.addEventListener('click', () => this.startLoop());
            this.stopBtn.addEventListener('click', () => this.stopLoop());

            if (this.isActive) {
                this.updateUIActive(true);
            }
        }

        log(msg) {
            if (!this.statusEl) return;
            const now = new Date().toLocaleTimeString();
            this.statusEl.innerHTML = `[${now}] ${msg}<br/>` + this.statusEl.innerHTML;
            console.log(`[DigikarAutoInput] ${msg}`);
        }

        updateUIActive(active) {
            if (active) {
                this.startBtn.style.display = "none";
                this.stopBtn.style.display = "block";
                document.getElementById('digikar-panel-indicator').innerText = "実行中";
                document.getElementById('digikar-panel-indicator').style.color = "#0d9488";
            } else {
                this.startBtn.style.display = "block";
                this.stopBtn.style.display = "none";
                document.getElementById('digikar-panel-indicator').innerText = "待機中";
                document.getElementById('digikar-panel-indicator').style.color = "#64748b";
            }
        }

        // ==========================================
        // 受付画面での処理
        // ==========================================
        async startLoop() {
            if (this.isActive) return;

            this.log("GASから本日の透析患者データを取得中...");
            this.updateUIActive(true);

            // 受付URLの日付から曜日を取得する
            const pathParts = window.location.pathname.split('/');
            const dateStr = pathParts[pathParts.length - 1]; // "20260603" など
            let targetDay = "";
            
            if (/^\d{8}$/.test(dateStr)) {
                const y = parseInt(dateStr.substring(0, 4));
                const m = parseInt(dateStr.substring(4, 6)) - 1;
                const d = parseInt(dateStr.substring(6, 8));
                const targetDate = new Date(y, m, d);
                const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
                targetDay = dayNames[targetDate.getDay()];
            } else {
                // フォールバック: 本日の曜日
                const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
                targetDay = dayNames[new Date().getDay()];
            }

            this.log(`検出された曜日: ${targetDay}曜日 (cool: all で一括取得)`);

            // GAS APIのリクエスト (日付パラメータも付与して月初判定・土曜午後判定の精度を担保)
            const apiDateParam = /^\d{8}$/.test(dateStr) ? dateStr : new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const url = `${GAS_API_URL}?day=${encodeURIComponent(targetDay)}&cool=all&date=${apiDateParam}`;

            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: (res) => {
                    try {
                        const json = JSON.parse(res.responseText);
                        if (json.status === "success" && json.patients) {
                            // 日付オブジェクトの作成（API呼び出し時と同じ日付）
                            let targetDate = new Date();
                            if (/^\d{8}$/.test(apiDateParam)) {
                                const y = parseInt(apiDateParam.substring(0, 4));
                                const m = parseInt(apiDateParam.substring(4, 6)) - 1;
                                const d = parseInt(apiDateParam.substring(6, 8));
                                targetDate = new Date(y, m, d);
                            }

                             const determineSetJS = (date, cool) => {
                                 const dayNum = date.getDate();
                                 const dayOfWeek = date.getDay(); // 0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土
                                 const isFirstMonOrTue = (dayNum <= 7) && (dayOfWeek === 1 || dayOfWeek === 2);
                                 
                                 // クールの表記揺れや文字化け（例：ߌ, PM, pm 等）への頑健な対応
                                 const coolStr = String(cool || "").toLowerCase();
                                 const isPM = coolStr.indexOf("後") !== -1 || coolStr.indexOf("p") !== -1 || coolStr.indexOf("pm") !== -1;
                                 
                                 const isSatPM = (dayOfWeek === 6) && isPM;
                                 if (isFirstMonOrTue) {
                                     return isSatPM ? "auto_HD_月初回_土曜午後" : "auto_HD_月初回_通常";
                                 } else {
                                     return isSatPM ? "auto_HD_土曜午後" : "auto_HD_通常";
                                 }
                             };

                            // デジカル自動入力の対象患者（IDが存在する患者）を抽出・補完
                            const targetPatients = json.patients
                                .filter(p => p.patientId)
                                .map(p => {
                                    // digikarCost が無い場合は JavaScript 側で自動判定して割り当てる
                                    if (!p.digikarCost) {
                                        p.digikarCost = determineSetJS(targetDate, p.cool);
                                    }
                                    return p;
                                });
                            
                            if (targetPatients.length === 0) {
                                this.log("対象となる透析患者データ（患者IDあり）が存在しません。");
                                this.stopLoop();
                                return;
                            }

                            this.patients = targetPatients;
                            this.currentIndex = 0;
                            this.isActive = true;

                            sessionStorage.setItem(KEY_ACTIVE, 'true');
                            sessionStorage.setItem(KEY_PATIENTS, JSON.stringify(targetPatients));
                            sessionStorage.setItem(KEY_INDEX, '0');
                            sessionStorage.setItem(KEY_RECEPTION_URL, window.location.href);

                            this.log(`対象患者: ${this.patients.length}件の処理を開始します。`);
                            this.processNextPatientAtReception();
                        } else {
                            this.log("GAS側でのデータ取得に失敗しました。");
                            this.stopLoop();
                        }
                    } catch (e) {
                        this.log("JSONデータの解析に失敗しました。");
                        this.stopLoop();
                    }
                },
                onerror: () => {
                    this.log("GASとの通信に失敗しました。");
                    this.stopLoop();
                }
            });
        }

        stopLoop() {
            this.isActive = false;
            sessionStorage.removeItem(KEY_ACTIVE);
            sessionStorage.removeItem(KEY_PATIENTS);
            sessionStorage.removeItem(KEY_INDEX);
            sessionStorage.removeItem(KEY_RECEPTION_URL);
            this.updateUIActive(false);
            this.log("自動処理を停止しました。");
        }

        async processNextPatientAtReception() {
            if (!this.isActive) return;

            if (this.currentIndex >= this.patients.length) {
                this.log("🎉 すべての患者の処理が完了しました！");
                this.stopLoop();
                alert("一括セット入力が完了しました。");
                return;
            }

            const patient = this.patients[this.currentIndex];
            this.log(`[進捗 ${this.currentIndex + 1}/${this.patients.length}] 患者ID: ${patient.patientId} を探索中...`);

            await sleep(1000);
            
            // 患者IDを受付画面のHTMLから探索してクリック
            const patientLink = this.findPatientLink(patient.patientId);

            if (patientLink) {
                this.log(`患者ID ${patient.patientId} のカルテリンクをクリックして遷移します。`);
                patientLink.click();
            } else {
                this.log(`⚠️ 受付画面内に患者ID ${patient.patientId} が見つかりませんでした。スキップして次へ進みます。`);
                this.currentIndex++;
                sessionStorage.setItem(KEY_INDEX, this.currentIndex.toString());
                this.processNextPatientAtReception();
            }
        }

        findPatientLink(patientId) {
            const cleanId = (id) => (id || "").replace(/^0+/, '').trim();
            const targetCleanId = cleanId(patientId);

            // 1. td内のID照合とアンカータグの優先検索 (デジカルのテーブル構造に対応)
            const tds = Array.from(document.querySelectorAll('td'));
            for (let td of tds) {
                const text = td.innerText.trim();
                if (cleanId(text) === targetCleanId && text.length > 0) {
                    // td内部のアンカー、または同じ行(tr)内の a.css-8r1d3z を取得
                    const link = td.querySelector('a') || td.parentElement.querySelector('a.css-8r1d3z');
                    if (link) return link;
                }
            }

            // 2. フォールバック: 最末端要素からの遡り検索
            const allElements = Array.from(document.querySelectorAll('a, span, td, div'));
            for (let el of allElements) {
                if (el.children.length === 0) { // 最末端の要素のみ
                    const text = el.innerText.trim();
                    if (cleanId(text) === targetCleanId && text.length > 0) {
                        let clickable = el;
                        while (clickable) {
                            if (clickable.tagName === 'A' || clickable.onclick || clickable.classList.contains('clickable')) {
                                return clickable;
                            }
                            clickable = clickable.parentElement;
                        }
                        return el;
                    }
                }
            }
            return null;
        }

        // ==========================================
        // カルテ画面での処理
        // ==========================================
        async processKartePage() {
            if (!this.isActive) return;

            const patient = this.patients[this.currentIndex];
            if (!patient) {
                this.log("患者情報が見つかりません。ループを終了します。");
                this.stopLoop();
                return;
            }

            this.log(`カルテ画面をロードしました。患者ID: ${patient.patientId} (セット: ${patient.digikarCost})`);

            // 安全性検証：現在開いているカルテの患者IDと、処理対象IDが一致するかチェック
            const currentPatientId = await this.getCurrentPatientIdFromKarte();
            if (currentPatientId) {
                const clean = (id) => (id || "").replace(/^0+/, '').trim();
                if (clean(currentPatientId) !== clean(patient.patientId)) {
                    this.log(`🚨 安全警告: 開いたカルテID(${currentPatientId})と対象ID(${patient.patientId})が不一致です。処理を停止します。`);
                    this.stopLoop();
                    return;
                }
            } else {
                this.log("カルテIDの検証をスキップします (ID取得失敗)。");
            }

            // 1. カルテエディタ（Tiptap/ProseMirror）への入力 (カルテ記述指定があれば)
            if (patient.digikarKarte) {
                this.log("カルテの経過記録を入力中...");
                const editor = await waitForElement('.tiptap, .ProseMirror');
                if (editor) {
                    editor.focus();
                    document.execCommand('insertText', false, "\n" + patient.digikarKarte + "\n");
                    await sleep(WAIT_MS);
                } else {
                    this.log("⚠️ カルテエディタが見つかりませんでした。");
                }
            }

            // 2. セットの自動入力
            if (patient.digikarCost) {
                this.log(`右パネルの「セット」タブをクリックします...`);
                // 右パネルのセットタブを探してクリック
                const tabs = Array.from(document.querySelectorAll('li, div, button'));
                const setTab = tabs.find(el => el.innerText.trim() === 'セット');
                if (setTab) {
                    setTab.click();
                    await sleep(1000);
                } else {
                    this.log("⚠️ 「セット」タブが見つかりませんでした。そのまま要素を検索します。");
                }

                this.log(`対象セット「${patient.digikarCost}」を画面上で探索中...`);
                // まずフォルダ展開を行わずに目的のセットを探す（アコーディオンが既に展開されている場合）
                let matchedSetElement = await this.findSetElement(patient.digikarCost, 2000);
                
                if (!matchedSetElement) {
                    // 見つからない場合、アコーディオンが閉じている可能性があるので、フォルダを展開
                    const folderName = GM_getValue('digikar_folder_name', '透析回診');
                    this.log(`セットが見つかりません。フォルダ「${folderName}」の展開を試みます...`);
                    const accordion = await this.findAccordionHeader(folderName);
                    if (accordion) {
                        accordion.click();
                        this.log(`フォルダ「${folderName}」をクリックしました。展開を待機します...`);
                        await sleep(1200); // 展開アニメーションを考慮
                        // 再度セットを検索（タイムアウト5秒）
                        matchedSetElement = await this.findSetElement(patient.digikarCost, 5000);
                    } else {
                        this.log(`⚠️ 設定されたフォルダ「${folderName}」が見つかりませんでした。`);
                    }
                }

                if (matchedSetElement) {
                    matchedSetElement.click();
                    this.log(`セット「${patient.digikarCost}」を適用しました。`);
                    await sleep(WAIT_MS);
                } else {
                    this.log(`❌ セット「${patient.digikarCost}」が画面上に見つかりませんでした。`);
                    this.log("安全のため、ここで一時停止します。手動で入力して完了させてください。");
                    this.stopLoop();
                    return;
                }
            }

            // 3. 保存処理
            this.log(`カルテの「${SAVE_TYPE}」ボタンをクリックします...`);
            const buttons = Array.from(document.querySelectorAll('button'));
            const saveBtn = buttons.find(b => b.innerText.trim() === SAVE_TYPE || b.innerText.trim() === "送信" || b.innerText.trim() === "保存" || b.innerText.trim() === "一時保存");
            
            if (saveBtn) {
                saveBtn.click();
                await sleep(800); // ポップアップ出現までの遅延
                
                // 確認ポップアップの自動処理
                await this.clickConfirmPopupSendButton();
                this.log(`送信処理を実行しました。遷移を待ちます...`);
                await sleep(WAIT_MS * 1.5);
            } else {
                this.log(`⚠️ 送信/保存ボタン（${SAVE_TYPE}）が見つかりませんでした。手動で保存してください。`);
                this.stopLoop();
                return;
            }

            // 4. 受付画面へ戻る
            this.log("受付画面に戻ります。");
            const receptionUrl = sessionStorage.getItem(KEY_RECEPTION_URL);
            if (receptionUrl) {
                window.location.href = receptionUrl;
            } else {
                window.history.back();
            }
        }

        async getCurrentPatientIdFromKarte() {
            // .css-ustlin の中の最初のspanに患者IDが入っている (M3デジカルの一般的な構成)
            const header = await waitForElement('.css-ustlin');
            if (header) {
                const spans = header.querySelectorAll(':scope > span');
                if (spans.length > 0) {
                    return spans[0].innerText.trim();
                }
            }
            return null;
        }

        async findAccordionHeader(folderName) {
            const normalize = (str) => (str || "").replace(/[\s　]/g, '').toLowerCase();
            const targetNorm = normalize(folderName);
            
            // アコーディオンのフォルダ名部分を探索
            const elements = Array.from(document.querySelectorAll('div, span, button, p, a'));
            for (let el of elements) {
                const text = el.innerText.trim();
                if (normalize(text).includes(targetNorm) && text.length > 0) {
                    return el;
                }
            }
            return null;
        }

        async findSetElement(setName, timeout = 8000) {
            const normalize = (str) => (str || "").replace(/[\s　]/g, '').toLowerCase();
            const targetNorm = normalize(setName);

            const start = Date.now();
            while (Date.now() - start < timeout) {
                // セット一覧の要素を探索する (a.css-cgnoip などの要素群)
                const items = Array.from(document.querySelectorAll('a.css-cgnoip, span.css-q5yng0, div.DKSetItem, button, [role="button"]'));
                for (let el of items) {
                    const text = el.innerText.trim();
                    if (normalize(text).includes(targetNorm) && text.length > 0) {
                        return el;
                    }
                }
                await sleep(250);
            }
            return null;
        }

        async clickConfirmPopupSendButton() {
            this.log("レセコン送信確認ポップアップの出現を待機しています...");
            const start = Date.now();
            while (Date.now() - start < 5000) {
                // ポップアップと思われるダイアログ要素、または「レセコンへ会計情報...」を含む要素を検索
                const elements = Array.from(document.querySelectorAll('div, [role="dialog"]'));
                const dialog = elements.find(el => el.innerText && el.innerText.includes("レセコンへ会計情報を送信しますか？"));
                if (dialog) {
                    // ダイアログ内の「送信」ボタン（通常は緑色）を探す
                    const buttons = Array.from(dialog.querySelectorAll('button'));
                    const sendBtn = buttons.find(b => b.innerText.trim() === "送信");
                    if (sendBtn) {
                        this.log("確認ポップアップの「送信」ボタンをクリックします。");
                        sendBtn.click();
                        return true;
                    }
                }
                await sleep(250);
            }
            this.log("⚠️ 確認ポップアップ（送信ボタン）が検出されませんでした。保存がそのまま完了した可能性があります。");
            return false;
        }

        // ==========================================
        // ページ判定とルーター
        // ==========================================
        checkCurrentPage() {
            const url = window.location.href;
            if (url.includes('/reception/')) {
                // 受付一覧画面
                if (this.isActive) {
                    this.currentIndex = parseInt(sessionStorage.getItem(KEY_INDEX) || '0');
                    // ループ継続
                    this.processNextPatientAtReception();
                }
            } else if (url.includes('/karte/') || url.includes('/patients/')) {
                // カルテ詳細画面
                if (this.isActive) {
                    // カルテ自動入力処理の実行
                    this.processKartePage();
                }
            }
        }
    }

    // 起動待機
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => new DigikarAutoInputLoop(), 1000));
    } else {
        setTimeout(() => new DigikarAutoInputLoop(), 1000);
    }
})();

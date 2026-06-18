// ==UserScript==
// @name         M3デジカル 受付画面起点・自動セット入力ツール
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  デジカル受付画面から透析患者カルテへ順次遷移し、セット適用・一時保存・帰還を自動ループ処理します
// @author       Antigravity
// @match        https://*.digikar.jp/reception/*
// @match        https://digikar.jp/reception/*
// @match        https://*.digikar.jp/karte/*
// @match        https://digikar.jp/karte/*
// @match        https://*.digikar.jp/patients/*
// @match        https://digikar.jp/patients/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      script.google.com
// @connect      googleusercontent.com
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/ohnishi-med/weborca-auto-reception/master/digikar_auto_input.user.js
// @downloadURL  https://raw.githubusercontent.com/ohnishi-med/weborca-auto-reception/master/digikar_auto_input.user.js
// ==/UserScript==

(function () {
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
    const KEY_ERRORS = 'digikar_auto_errors';
    const KEY_TARGET_DAY = 'digikar_auto_target_day';
    const KEY_RUN_MODE = 'digikar_auto_run_mode';

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

            this.isActive = localStorage.getItem(KEY_ACTIVE) === 'true';
            this.patients = JSON.parse(localStorage.getItem(KEY_PATIENTS) || '[]');
            this.currentIndex = parseInt(localStorage.getItem(KEY_INDEX) || '0');
            this.lastProcessedUrl = '';

            this.initUI();
            this.checkCurrentPage();

            // SPA (シングルページアプリケーション) のURL遷移監視
            this.lastUrl = window.location.href;
            this.urlCheckInterval = setInterval(() => {
                const currentUrl = window.location.href;
                if (currentUrl !== this.lastUrl) {
                    console.log(`[DigikarAutoInput] URL change detected: ${this.lastUrl} -> ${currentUrl}`);
                    this.lastUrl = currentUrl;
                    this.checkCurrentPage();
                }
            }, 500);
        }

        initUI() {
            if (document.getElementById('digikar-auto-panel')) return;

            const div = document.createElement('div');
            div.id = 'digikar-auto-panel';
            div.innerHTML = `
                <h4 style="user-select: none;">
                    <span>🤖 透析セット一括入力</span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size:10px; color:#64748b;" id="digikar-panel-indicator">待機中</span>
                        <span class="digikar-panel-btn" id="digikar-auto-minimize" title="最小化" style="font-weight:bold;">➖</span>
                        <span class="digikar-panel-btn" id="digikar-auto-close" title="閉じる" style="font-weight:bold;">✖</span>
                    </div>
                </h4>
                <div id="digikar-auto-content">
                    <div id="digikar-control-area" style="display: flex; flex-direction: column; gap: 6px;">
                        <button class="digikar-btn-primary" id="digikar-auto-start-karte" style="margin-top: 4px;">算定・カルテ 一括入力</button>
                        <button class="digikar-btn-primary" id="digikar-auto-start-regular" style="margin-top: 4px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); box-shadow: 0 3px 6px rgba(3, 105, 161, 0.2);">定期処方 一括入力</button>
                        <button class="digikar-btn-secondary" id="digikar-auto-stop" style="margin-top: 4px; display: none;">一時停止</button>
                    </div>
                    <div style="text-align: right; display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                        <a href="https://docs.google.com/spreadsheets/d/1yUgZgDLV1aJJHnmFmEgTBgXLYM34tkhfVezY25zO8Ew/edit?gid=0#gid=0" target="_blank" style="font-size: 11px; color: #0d9488; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                            透析患者リスト
                        </a>
                        <span class="digikar-settings-toggle" id="digikar-auto-settings-toggle" style="margin-top: 0;">⚙️ フォルダ・階層設定</span>
                    </div>
                    <div class="digikar-settings-area" id="digikar-auto-settings-area" style="display: none; max-height: 240px; overflow-y: auto;">
                        <div class="digikar-input-group">
                            <label style="font-size: 10px;">算定・カルテ用のフォルダ階層 (例: 透析回診 &gt; 自動算定入力):</label>
                            <input type="text" class="digikar-input-text" id="digikar-auto-folder-name" placeholder="透析回診 > 自動算定入力">
                        </div>
                        <div class="digikar-input-group" style="margin-top: 6px;">
                            <label style="font-size: 10px;">定期処方用の親フォルダ階層 (例: 透析回診):</label>
                            <input type="text" class="digikar-input-text" id="digikar-auto-regular-folder-name" placeholder="透析回診">
                        </div>
                        <div style="font-size: 9px; color: #64748b; margin-top: 6px; line-height: 1.3;">
                            ※ 「フォルダ > 子フォルダ」のように &gt; で繋げて複数階層を指定できます。<br/>
                            ※ 定期処方では、設定した親フォルダの配下に曜日フォルダ（例: 定期処方（月水金））が自動的に連結されて展開されます。
                        </div>
                        <button class="digikar-btn-primary" id="digikar-auto-save-settings" style="margin-top: 8px; padding: 5px; font-size: 11px;">設定を保存</button>
                    </div>
                    <div id="digikar-auto-status">ログ: 待機中...</div>
                </div>
            `;
            document.body.appendChild(div);

            this.panel = div;
            this.statusEl = div.querySelector('#digikar-auto-status');
            this.startBtnKarte = div.querySelector('#digikar-auto-start-karte');
            this.startBtnRegular = div.querySelector('#digikar-auto-start-regular');
            this.stopBtn = div.querySelector('#digikar-auto-stop');

            const settingsToggle = div.querySelector('#digikar-auto-settings-toggle');
            const settingsArea = div.querySelector('#digikar-auto-settings-area');
            const folderInput = div.querySelector('#digikar-auto-folder-name');
            const regularFolderInput = div.querySelector('#digikar-auto-regular-folder-name');
            const saveSettingsBtn = div.querySelector('#digikar-auto-save-settings');

            const minimizeBtn = div.querySelector('#digikar-auto-minimize');
            const closeBtn = div.querySelector('#digikar-auto-close');
            const contentArea = div.querySelector('#digikar-auto-content');

            // 最小化状態の復元 (localStorageに保存)
            const isMinimized = localStorage.getItem('digikar_panel_minimized') === 'true';
            if (isMinimized) {
                contentArea.style.display = 'none';
                minimizeBtn.innerText = '➕';
                minimizeBtn.title = '元に戻す';
            }

            minimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const hidden = contentArea.style.display === 'none';
                if (hidden) {
                    contentArea.style.display = 'block';
                    minimizeBtn.innerText = '➖';
                    minimizeBtn.title = '最小化';
                    localStorage.setItem('digikar_panel_minimized', 'false');
                } else {
                    contentArea.style.display = 'none';
                    minimizeBtn.innerText = '➕';
                    minimizeBtn.title = '元に戻す';
                    localStorage.setItem('digikar_panel_minimized', 'true');
                }
            });

            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm("一括セット入力パネルを閉じますか？（ページを再読み込みすると再度表示されます）")) {
                    div.style.display = 'none';
                }
            });

            // 保存されている値を取得して設定
            let savedFolder = GM_getValue('digikar_folder_name', '透析回診 > 自動算定入力');
            // マイグレーション: 旧デフォルト値 '透析回診' を新デフォルト値 '透析回診 > 自動算定入力' に自動アップグレード
            if (savedFolder === '透析回診') {
                savedFolder = '透析回診 > 自動算定入力';
                GM_setValue('digikar_folder_name', savedFolder);
            }
            const savedRegularFolder = GM_getValue('digikar_regular_folder_name', '透析回診');
            folderInput.value = savedFolder;
            regularFolderInput.value = savedRegularFolder;

            settingsToggle.addEventListener('click', () => {
                const isHidden = settingsArea.style.display === 'none';
                settingsArea.style.display = isHidden ? 'block' : 'none';
            });

            saveSettingsBtn.addEventListener('click', () => {
                const val = folderInput.value.trim();
                const valReg = regularFolderInput.value.trim();
                if (val && valReg) {
                    GM_setValue('digikar_folder_name', val);
                    GM_setValue('digikar_regular_folder_name', valReg);
                    this.log(`設定（算定:「${val}」/ 定期:「${valReg}」）を保存しました。`);
                    settingsArea.style.display = 'none';
                } else {
                    alert("フォルダ名を入力してください。");
                }
            });

            this.startBtnKarte.addEventListener('click', () => this.startLoop('karte'));
            this.startBtnRegular.addEventListener('click', () => this.startLoop('regular'));
            this.stopBtn.addEventListener('click', () => this.stopLoop());

            // ドラッグ＆ドロップ機能の実装
            const header = div.querySelector('h4');
            header.style.cursor = 'move';

            let isDragging = false;
            let startX, startY;
            let initialX, initialY;

            // 初期位置を復元 (画面外にはみ出している場合は安全のためにリセット)
            const savedTop = localStorage.getItem('digikar_panel_top');
            const savedLeft = localStorage.getItem('digikar_panel_left');
            if (savedTop !== null && savedLeft !== null) {
                const topVal = parseInt(savedTop, 10);
                const leftVal = parseInt(savedLeft, 10);
                
                // 現在のウィンドウサイズに収まっているかチェック (はみ出し防止マージンを考慮)
                const isWithinWindow = (leftVal >= 0 && leftVal < window.innerWidth - 150) &&
                                       (topVal >= 0 && topVal < window.innerHeight - 50);
                
                if (isWithinWindow) {
                    div.style.top = savedTop;
                    div.style.left = savedLeft;
                    div.style.right = 'auto'; // 右端固定を解除
                } else {
                    console.log(`[DigikarAutoInput] Reset panel position (out of bounds: top=${savedTop}, left=${savedLeft})`);
                    localStorage.removeItem('digikar_panel_top');
                    localStorage.removeItem('digikar_panel_left');
                }
            }

            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.digikar-panel-btn')) return; // ボタンをクリックしたときはドラッグしない
                isDragging = true;
                
                // 現在のスタイル座標を取得
                const rect = div.getBoundingClientRect();
                startX = e.clientX;
                startY = e.clientY;
                initialX = rect.left;
                initialY = rect.top;

                // テキスト選択を防ぐ
                e.preventDefault();
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                const newLeft = initialX + dx;
                const newTop = initialY + dy;

                div.style.left = `${newLeft}px`;
                div.style.top = `${newTop}px`;
                div.style.right = 'auto';
            });

            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    localStorage.setItem('digikar_panel_top', div.style.top);
                    localStorage.setItem('digikar_panel_left', div.style.left);
                }
            });

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
                this.startBtnKarte.style.display = "none";
                this.startBtnRegular.style.display = "none";
                this.stopBtn.style.display = "block";
                document.getElementById('digikar-panel-indicator').innerText = "実行中";
                document.getElementById('digikar-panel-indicator').style.color = "#0d9488";
            } else {
                this.startBtnKarte.style.display = "block";
                this.startBtnRegular.style.display = "block";
                this.stopBtn.style.display = "none";
                document.getElementById('digikar-panel-indicator').innerText = "待機中";
                document.getElementById('digikar-panel-indicator').style.color = "#64748b";
            }
        }

        // ==========================================
        // 受付画面での処理
        // ==========================================
        async startLoop(mode) {
            if (this.isActive) return;

            localStorage.removeItem(KEY_ERRORS);
            const modeText = mode === 'karte' ? '算定・カルテ' : '定期処方';
            this.log(`GASから本日の透析患者データを取得中 (${modeText})...`);
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
                                    const baseSet = determineSetJS(targetDate, p.cool);
                                    if (p.digikarCost) {
                                        const costStr = String(p.digikarCost).trim();
                                        if (costStr.startsWith("auto_HD_")) {
                                            p.digikarCostCandidates = [costStr];
                                        } else {
                                            // 氏名などの個別指定がある場合、baseSet + 個別指定を第一候補、baseSetを第二候補とする
                                            p.digikarCostCandidates = [baseSet + costStr, baseSet];
                                        }
                                    } else {
                                        p.digikarCostCandidates = [baseSet];
                                    }
                                    // 互換性のため p.digikarCost にも第一候補をセットしておく
                                    p.digikarCost = p.digikarCostCandidates[0];
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

                            localStorage.setItem(KEY_ACTIVE, 'true');
                            localStorage.setItem(KEY_PATIENTS, JSON.stringify(targetPatients));
                            localStorage.setItem(KEY_INDEX, '0');
                            localStorage.setItem(KEY_RECEPTION_URL, window.location.href);
                            localStorage.setItem(KEY_TARGET_DAY, targetDay);
                            localStorage.setItem(KEY_RUN_MODE, mode);

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
            this.lastProcessedUrl = '';
            localStorage.removeItem(KEY_ACTIVE);
            localStorage.removeItem(KEY_PATIENTS);
            localStorage.removeItem(KEY_INDEX);
            localStorage.removeItem(KEY_RECEPTION_URL);
            localStorage.removeItem(KEY_TARGET_DAY);
            localStorage.removeItem(KEY_RUN_MODE);
            this.updateUIActive(false);
            this.log("自動処理を停止しました。");
        }

        async processNextPatientAtReception() {
            if (!this.isActive) return;

            if (this.currentIndex >= this.patients.length) {
                this.log("🎉 すべての患者の処理が完了しました！");
                const errors = JSON.parse(localStorage.getItem(KEY_ERRORS) || '[]');
                this.stopLoop();
                if (errors.length > 0) {
                    let errorMsg = "⚠️ 一括処理が完了しましたが、以下のエラーが発生しました:\n\n";
                    errors.forEach(e => {
                        errorMsg += `・患者ID: ${e.patientId} - ${e.message}\n`;
                    });
                    alert(errorMsg);
                } else {
                    alert("一括セット入力が完了しました。");
                }
                return;
            }

            const patient = this.patients[this.currentIndex];
            this.log(`[進捗 ${this.currentIndex + 1}/${this.patients.length}] 患者ID: ${patient.patientId} を探索中...`);

            await sleep(1000);

            // 患者IDを受付画面のHTMLから探索してクリック
            const patientLink = this.findPatientLink(patient.patientId);

            if (patientLink) {
                this.log(`患者ID ${patient.patientId} のカルテリンクをクリックして遷移します。`);

                // 別タブで開くのを防止し、同一タブで遷移させる
                if (patientLink.tagName === 'A') {
                    patientLink.target = '_self';
                    const href = patientLink.getAttribute('href');
                    if (href) {
                        console.log(`[DigikarAutoInput] Same tab navigation to: ${href}`);
                        window.location.href = href;
                        return;
                    }
                }

                patientLink.click();
            } else {
                this.log(`⚠️ 受付画面内に患者ID ${patient.patientId} が見つかりませんでした。スキップして次へ進みます。`);
                this.currentIndex++;
                localStorage.setItem(KEY_INDEX, this.currentIndex.toString());
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
            console.log(`[DigikarAutoInput] processKartePage started. isActive: ${this.isActive}`);
            if (!this.isActive) return;

            const patient = this.patients[this.currentIndex];
            console.log(`[DigikarAutoInput] current patient index: ${this.currentIndex}`, patient);
            if (!patient) {
                this.log("患者情報が見つかりません。ループを終了します。");
                this.stopLoop();
                return;
            }

            this.log(`カルテ画面をロードしました。患者ID: ${patient.patientId} (セット: ${patient.digikarCost})`);
            console.log(`[DigikarAutoInput] Cost candidates:`, patient.digikarCostCandidates);

            // 安全性検証：現在開いているカルテの患者IDと、処理対象IDが一致するかチェック
            const currentPatientId = await this.getCurrentPatientIdFromKarte();
            console.log(`[DigikarAutoInput] Checked current patient ID from screen: ${currentPatientId}`);
            if (currentPatientId) {
                const clean = (id) => (id || "").replace(/^0+/, '').trim();
                if (clean(currentPatientId) !== clean(patient.patientId)) {
                    this.log(`🚨 安全警告: 開いたカルテID(${currentPatientId})と対象ID(${patient.patientId})が不一致です。処理を停止します。`);
                    console.error(`[DigikarAutoInput] Patient ID mismatch. Expected: ${patient.patientId}, Actual: ${currentPatientId}`);
                    this.stopLoop();
                    return;
                }
            } else {
                this.log("カルテIDの検証をスキップします (ID取得失敗)。");
                console.warn("[DigikarAutoInput] Could not retrieve patient ID from the page header.");
            }

            const runMode = localStorage.getItem(KEY_RUN_MODE) || 'karte';
            const runKarteCost = runMode === 'karte';
            const runRegular = runMode === 'regular';

            // 1. カルテエディタ（Tiptap/ProseMirror）への入力 (カルテ記述指定があり、かつ「算定・カルテ」チェックがONの場合)
            if (runKarteCost && patient.digikarKarte) {
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

            // 2. 「セット」タブのクリック (「算定・カルテ」または「定期処方」がONの場合に実行)
            if (runKarteCost || runRegular) {
                this.log(`右パネルの「セット」タブをクリックします...`);
                // 右パネルのセットタブを探してクリック
                const tabs = Array.from(document.querySelectorAll('li, div, button'));
                console.log(`[DigikarAutoInput] Looking for set tab in ${tabs.length} elements...`);
                const setTab = tabs.find(el => el.innerText && el.innerText.trim() === 'セット');
                if (setTab) {
                    console.log(`[DigikarAutoInput] Found set tab element. Clicking:`, setTab);
                    setTab.click();
                    await sleep(1000);
                } else {
                    this.log("⚠️ 「セット」タブが見つかりませんでした。そのまま要素を検索します。");
                    console.warn(`[DigikarAutoInput] "セット" tab not found in the tabs list.`);
                }
            }

            // 2.1 算定・カルテの自動入力 (「算定・カルテ」チェックがONの場合)
            if (runKarteCost) {
                const candidates = patient.digikarCostCandidates || (patient.digikarCost ? [patient.digikarCost] : []);
                console.log(`[DigikarAutoInput] Set candidates count: ${candidates.length}, list:`, candidates);
                if (candidates.length > 0) {
                    this.log(`対象セット候補「${candidates.join(', ')}」を画面上で探索中...`);
                    let matchedSetElement = null;
                    let appliedSetName = "";

                    // 候補順にセットを探索（フォルダ展開前に見つかるか試す）
                    for (const setName of candidates) {
                        console.log(`[DigikarAutoInput] Searching for "${setName}" before expanding folder...`);
                        matchedSetElement = await this.findSetElement(setName, 1500);
                        if (matchedSetElement) {
                            appliedSetName = setName;
                            console.log(`[DigikarAutoInput] Set "${setName}" found before expansion!`);
                            break;
                        }
                    }

                    if (!matchedSetElement) {
                        const folderPath = GM_getValue('digikar_folder_name', '透析回診 > 自動算定入力');
                        this.log(`セットが見つかりません。フォルダ「${folderPath}」の多階層展開を試みます...`);
                        await this.expandMultiDepthFolders(folderPath);
                        
                        // 展開後に最終確認
                        for (const name of candidates) {
                            matchedSetElement = await this.findSetElement(name, 2000);
                            if (matchedSetElement) {
                                appliedSetName = name;
                                break;
                            }
                        }
                    }

                    if (matchedSetElement) {
                        console.log(`[DigikarAutoInput] Clicking matched set element:`, matchedSetElement);
                        matchedSetElement.click();
                        this.log(`セット「${appliedSetName}」を適用しました。`);
                        await sleep(WAIT_MS);

                        // 運動療法のセット適用 (あり の場合)
                        if (patient.exerciseTherapy === "あり") {
                            this.log(`運動療法「あり」のため、追加セット「auto_運動療法」の適用を試みます...`);
                            let matchedExerciseElement = await this.findSetElement("auto_運動療法", 3000);
                            if (matchedExerciseElement) {
                                console.log(`[DigikarAutoInput] Clicking matched exercise set element:`, matchedExerciseElement);
                                matchedExerciseElement.click();
                                this.log(`追加セット「auto_運動療法」を適用しました。`);
                                await sleep(WAIT_MS);
                            } else {
                                const errorMsg = `追加セット「auto_運動療法」が画面上に見つかりませんでした。`;
                                this.log(`❌ ${errorMsg}`);
                                this.addError(patient.patientId, errorMsg);
                                await this.skipToNextPatient();
                                return;
                            }
                        }
                    } else {
                        const errorMsg = `セット候補「${candidates.join(', ')}」が画面上に見つかりませんでした。`;
                        this.log(`❌ ${errorMsg}`);
                        console.error(`[DigikarAutoInput] ${errorMsg}`);
                        this.addError(patient.patientId, errorMsg);
                        await this.skipToNextPatient();
                        return;
                    }
                }
            }

            // 2.2 定期処方セットの自動入力 (「定期処方」チェックがONの場合)
            const savedTargetDay = localStorage.getItem(KEY_TARGET_DAY) || "";
            let subFolderName = "";
            const isMonWedFri = ["月", "水", "金"].includes(savedTargetDay);
            const isTueThuSat = ["火", "木", "土"].includes(savedTargetDay);
            if (isMonWedFri) {
                subFolderName = "定期処方（月水金）";
            } else if (isTueThuSat) {
                subFolderName = "定期処方（火木土）";
            }

            if (runRegular && subFolderName) {
                this.log(`定期処方セットの自動入力を開始します...`);
                let patientName = "";
                if (patient.patientName) {
                    patientName = patient.patientName.replace(/[\s　]/g, '').trim();
                } else if (patient.name) {
                    patientName = patient.name.replace(/[\s　]/g, '').trim();
                } else {
                    const nameFromKarte = await this.getCurrentPatientNameFromKarte();
                    if (nameFromKarte) {
                        patientName = nameFromKarte;
                    }
                }

                if (patientName) {
                    const regularSetName = `auto定期_${patientName}`;
                    this.log(`定期処方セット「${regularSetName}」を探します...`);

                    let matchedRegularSet = await this.findSetElement(regularSetName, 1500);

                    if (!matchedRegularSet) {
                        const parentFolderPath = GM_getValue('digikar_regular_folder_name', '透析回診');
                        const fullFolderPath = parentFolderPath ? `${parentFolderPath} > ${subFolderName}` : subFolderName;
                        this.log(`セットが見つかりません。フォルダ「${fullFolderPath}」の多階層展開を試みます...`);
                        await this.expandMultiDepthFolders(fullFolderPath);
                        
                        // 展開後に最終確認
                        matchedRegularSet = await this.findSetElement(regularSetName, 2000);
                    }

                    if (matchedRegularSet) {
                        matchedRegularSet.click();
                        this.log(`定期処方セット「${regularSetName}」を適用しました。`);
                        await sleep(WAIT_MS);
                    } else {
                        this.log(`⚠️ 定期処方セット「${regularSetName}」が画面上に見つかりませんでした。スキップします。`);
                    }
                } else {
                    this.log(`⚠️ 患者氏名が取得できなかったため、定期処方の入力をスキップします。`);
                }
            }

            // 3. 保存処理
            this.log(`カルテの「${SAVE_TYPE}」ボタンをクリックします...`);
            const buttons = Array.from(document.querySelectorAll('button:not(#digikar-auto-panel *), [role="button"]:not(#digikar-auto-panel *), a:not(#digikar-auto-panel *)'));
            console.log(`[DigikarAutoInput] Searching for save/send button in ${buttons.length} elements...`);
            
            const saveBtn = buttons.find(b => {
                // 1. title属性やaria-label、data-tooltipに「送信」「保存」等が含まれているかチェック
                const titleText = (b.title || b.getAttribute('aria-label') || b.getAttribute('data-tooltip') || "").trim();
                if (titleText.includes(SAVE_TYPE) || titleText.includes("送信") || titleText.includes("保存")) {
                    console.log(`[DigikarAutoInput] Matched send button by title/aria-label: "${titleText}"`, b);
                    return true;
                }

                const text = (b.innerText || "").replace(/[\s　\r\n]/g, ''); // 空白や改行を完全除去
                if (text.length > 0 && text.length < 15) {
                    // SAVE_TYPE ("送信") や一般的なキーワードを部分一致で検索
                    if (text.includes(SAVE_TYPE) || text.includes("送信") || text.includes("保存") || text.includes("一時保存")) {
                        return true;
                    }
                }
                // テキストがない場合でも、特定の送信アイコンSVGを持つボタンを検出
                const svgPath = b.querySelector('svg path');
                if (svgPath) {
                    const d = svgPath.getAttribute('d') || '';
                    if (d.startsWith('M4.65 4') || d.includes('M4.65 4h4.905')) {
                        console.log(`[DigikarAutoInput] Matched send button by SVG path signature:`, b);
                        return true;
                    }
                }
                return false;
            });

            if (saveBtn) {
                console.log(`[DigikarAutoInput] Found save button: "${saveBtn.innerText.trim()}"`, saveBtn);
                saveBtn.click();
                await sleep(800); // ポップアップ出現までの遅延

                // 確認ポップアップの自動処理
                await this.handleConfirmPopups();
                
                // 処理成功として次の患者に進む
                this.currentIndex++;
                localStorage.setItem(KEY_INDEX, this.currentIndex.toString());
                
                this.log(`送信処理を実行しました。遷移を待ちます...`);
                await sleep(WAIT_MS * 1.5);
            } else {
                this.log(`⚠️ 送信/保存ボタン（${SAVE_TYPE}）が見つかりませんでした。手動で保存してください。`);
                this.stopLoop();
                return;
            }

            // 4. 受付画面へ戻る
            this.log("受付画面に戻ります。");
            const receptionUrl = localStorage.getItem(KEY_RECEPTION_URL);
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

        async getCurrentPatientNameFromKarte() {
            // .css-ustlin 内の2番目のspan等に氏名が入っている構成が多い
            const header = await waitForElement('.css-ustlin');
            if (header) {
                const spans = header.querySelectorAll(':scope > span');
                if (spans.length > 1) {
                    return spans[1].innerText.replace(/[\s　]/g, '').trim();
                }
            }
            return null;
        }

        async expandMultiDepthFolders(fullPathStr) {
            if (!fullPathStr) return;
            const folderNames = fullPathStr.split('>').map(s => s.trim()).filter(Boolean);
            
            this.log(`アコーディオン展開を開始: ${folderNames.join(' > ')}`);
            console.log(`[DigikarAutoInput] expandMultiDepthFolders initiated with path: "${fullPathStr}"`, folderNames);
            
            for (let i = 0; i < folderNames.length; i++) {
                const targetFolder = folderNames[i];
                let isAlreadyOpen = false;
                
                // 次の階層のフォルダが存在する場合、それが画面上に見えているかチェックする
                if (i < folderNames.length - 1) {
                    const nextFolder = folderNames[i + 1];
                    console.log(`[DigikarAutoInput] Checking if next level folder "${nextFolder}" is visible to determine if parent "${targetFolder}" is already open...`);
                    const nextAccordions = await this.findAllAccordionHeaders(nextFolder);
                    
                    if (nextAccordions.length > 0) {
                        isAlreadyOpen = nextAccordions.some(acc => {
                            const isVisible = acc.offsetParent !== null;
                            console.log(`[DigikarAutoInput] Checked next level accordion item:`, acc, `| offsetParent:`, acc.offsetParent, `| isVisible:`, isVisible);
                            return isVisible;
                        });
                    } else {
                        console.log(`[DigikarAutoInput] Next level folder "${nextFolder}" was not found in DOM at all.`);
                    }
                    console.log(`[DigikarAutoInput] Decision: isAlreadyOpen for "${targetFolder}" is evaluated as:`, isAlreadyOpen);
                }
                
                if (!isAlreadyOpen) {
                    const accordions = await this.findAllAccordionHeaders(targetFolder);
                    console.log(`[DigikarAutoInput] Found ${accordions.length} accordions for target folder "${targetFolder}" to expand.`);
                    if (accordions.length > 0) {
                        this.log(`フォルダ「${targetFolder}」を展開します。`);
                        for (let acc of accordions) {
                            console.log(`[DigikarAutoInput] Clicking folder element (morning style):`, acc);
                            acc.click();
                        }
                        await sleep(1000); // アニメーション待機
                    } else {
                        this.log(`⚠️ フォルダ「${targetFolder}」が見つかりませんでした。`);
                    }
                } else {
                    this.log(`フォルダ「${targetFolder}」はすでに展開されています。`);
                    console.log(`[DigikarAutoInput] Skipping click for "${targetFolder}" because it's already open.`);
                }
            }
        }

        async findAllAccordionHeaders(folderName) {
            const normalize = (str) => (str || "").replace(/[\s　]/g, '').toLowerCase();
            const targetNorm = normalize(folderName);
            console.log(`[DigikarAutoInput] findAllAccordionHeaders: searching for "${folderName}" (normalized: "${targetNorm}")`);

            const elements = Array.from(document.querySelectorAll('div, span, button, p, a'));
            const results = [];

            // 1. 完全一致する最も内側の要素を最優先で収集
            for (let el of elements) {
                // 自作パネル内の要素は除外
                if (el.closest('#digikar-auto-panel')) continue;

                const text = el.innerText ? el.innerText.trim() : "";
                if (normalize(text) === targetNorm) {
                    // 子要素に同じテキストを持つ子ノードがないか確認し、最も内側の要素だけを収集
                    const children = Array.from(el.querySelectorAll('div, span, p, a'));
                    const hasChildWithSameText = children.some(child => normalize(child.innerText || "").trim() === targetNorm);
                    if (!hasChildWithSameText) {
                        // 画面上に実際に表示されている要素のみを対象とする
                        const rect = el.getBoundingClientRect();
                        const isVisible = el.offsetParent !== null && rect.width > 0 && rect.height > 0;
                        if (isVisible) {
                            console.log(`[DigikarAutoInput] PERFECT match found:`, el, `| Original text: "${text}"`);
                            results.push(el);
                        }
                    }
                }
            }

            if (results.length > 0) {
                console.log(`[DigikarAutoInput] Perfect match elements found: ${results.length}`, results);
                return results;
            }

            // 2. 部分一致でテキスト長が短い要素を収集
            console.log(`[DigikarAutoInput] No perfect matches for "${folderName}". Trying partial matches...`);
            const partMatches = [];
            for (let el of elements) {
                // 自作パネル内の要素は除外
                if (el.closest('#digikar-auto-panel')) continue;

                const text = el.innerText ? el.innerText.trim() : "";
                const normText = normalize(text);
                if (normText.includes(targetNorm) && text.length > 0) {
                    // 画面上に実際に表示されている要素のみを対象とする
                    const rect = el.getBoundingClientRect();
                    const isVisible = el.offsetParent !== null && rect.width > 0 && rect.height > 0;
                    if (isVisible) {
                        partMatches.push({ el, length: text.length, text });
                    }
                }
            }

            // 長さの昇順ソートをして、最も短い長さのアコーディオンから返す
            partMatches.sort((a, b) => a.length - b.length);
            if (partMatches.length > 0) {
                const minLength = partMatches[0].length;
                const filtered = partMatches.filter(m => m.length <= minLength + 5);
                console.log(`[DigikarAutoInput] Partial match elements found (length close to ${minLength}):`, filtered);
                const filteredElements = filtered.map(m => m.el);
                return filteredElements;
            }

            console.log(`[DigikarAutoInput] No matches at all for folder: "${folderName}"`);
            return [];
        }

        async findSetElement(setName, timeout = 8000) {
            const normalize = (str) => (str || "").replace(/[\s　]/g, '').toLowerCase();
            const targetNorm = normalize(setName);
            console.log(`[DigikarAutoInput] findSetElement: searching "${setName}" (normalized: "${targetNorm}") timeout: ${timeout}ms`);

            const start = Date.now();
            let checkCount = 0;
            while (Date.now() - start < timeout) {
                checkCount++;
                // 動的なクラス名（css-xudyti等）にも対応できるよう、a, span, button等の基本要素を広く検索
                const items = Array.from(document.querySelectorAll('a, span, button, [role="button"]'));
                if (checkCount === 1 || checkCount % 5 === 0) {
                    console.log(`[DigikarAutoInput] findSetElement loop check #${checkCount}. Found ${items.length} potential set item elements in DOM.`);
                }
                for (let el of items) {
                    // 自作パネル内の要素は探索から除外する
                    if (el.closest('#digikar-auto-panel')) continue;

                    const text = el.innerText.trim();
                    if (normalize(text).includes(targetNorm) && text.length > 0) {
                        // 画面上に実際に表示されている（クリック可能な）要素のみを対象とする
                        const rect = el.getBoundingClientRect();
                        const isVisible = el.offsetParent !== null && rect.width > 0 && rect.height > 0;
                        if (isVisible) {
                            console.log(`[DigikarAutoInput] Visible match found! Text: "${text}", Element:`, el);
                            return el;
                        } else {
                            console.log(`[DigikarAutoInput] Ignore invisible match: "${text}"`);
                        }
                    }
                }
                await sleep(250);
            }
            console.log(`[DigikarAutoInput] findSetElement: timed out searching for "${setName}"`);
            return null;
        }

        async handleConfirmPopups() {
            this.log("確認ポップアップ/警告一覧の出現を待機しています...");
            const start = Date.now();
            let hasHandledWarning = false;
            let hasHandledSend = false;

            // 最大10秒間、各種ポップアップの出現を監視・処理する
            while (Date.now() - start < 10000) {
                // すべてのdivとdialog要素を取得
                const elements = Array.from(document.querySelectorAll('div, [role="dialog"]'));

                // ① 警告一覧のチェック
                if (!hasHandledWarning) {
                    const warningDialog = elements.find(el => el.innerText && el.innerText.includes("警告一覧") && el.innerText.includes("確認が必要な警告があります"));
                    if (warningDialog) {
                        // 1. まず button タグから最優先で探す（ラッパーdivなどの誤検出防止）
                        let saveBtn = Array.from(warningDialog.querySelectorAll('button'))
                            .find(b => b.innerText && b.innerText.trim() === "保存");

                        // 2. button がなければ div, span, [role="button"] から広く探す
                        if (!saveBtn) {
                            const candidates = Array.from(warningDialog.querySelectorAll('div, span, [role="button"]'));
                            saveBtn = candidates.find(b => b.innerText && b.innerText.trim() === "保存");
                        }

                        if (saveBtn) {
                            this.log("⚠️ 警告一覧を検出しました。「保存」ボタンをクリックします。");
                            // React/SPA対応のマウスクリックシーケンス（viewオプションを省略してTypeErrorを回避）
                            const eventOptions = { bubbles: true, cancelable: true };
                            saveBtn.dispatchEvent(new MouseEvent('mousedown', eventOptions));
                            saveBtn.dispatchEvent(new MouseEvent('mouseup', eventOptions));
                            saveBtn.click();
                            
                            hasHandledWarning = true;
                            await sleep(1500); // 遷移や次のポップアップ出現を待つ
                            continue; // ループの最初に戻って再チェック
                        }
                    }
                }

                // ② レセコン送信確認ダイアログのチェック
                if (!hasHandledSend) {
                    const sendDialog = elements.find(el => el.innerText && el.innerText.includes("レセコンへ会計情報を送信しますか？"));
                    if (sendDialog) {
                        const buttons = Array.from(sendDialog.querySelectorAll('button'));
                        const sendBtn = buttons.find(b => b.innerText.trim() === "送信");
                        if (sendBtn) {
                            this.log("確認ポップアップの「送信」ボタンをクリックします。");
                            sendBtn.click();
                            hasHandledSend = true;
                            // 送信クリック後、さらに「警告一覧」が出る可能性があるため、
                            // 即時終了せずループを継続して監視する
                            await sleep(1500);
                            continue;
                        }
                    }
                }

                // 送信処理または警告処理を実行したあと、画面上にダイアログが残っていなければ完了とする
                if (hasHandledSend || hasHandledWarning) {
                    await sleep(1500); // 画面が完全に落ち着く（または遷移が始まる）のを待つ
                    const finalElements = Array.from(document.querySelectorAll('div, [role="dialog"]'));
                    const hasActiveDialog = finalElements.some(el => el.innerText && (
                        (el.innerText.includes("警告一覧") && el.innerText.includes("確認が必要な警告があります")) ||
                        el.innerText.includes("レセコンへ会計情報を送信しますか？")
                    ));
                    if (!hasActiveDialog) {
                        this.log("ポップアップ処理が正常に完了しました。");
                        return true;
                    }
                }

                await sleep(300);
            }
            this.log("⚠️ ポップアップの監視がタイムアウトしました。");
            return false;
        }

        // ==========================================
        // ページ判定とルーター
        // ==========================================
        addError(patientId, message) {
            const errors = JSON.parse(localStorage.getItem(KEY_ERRORS) || '[]');
            errors.push({ patientId, message, time: new Date().toLocaleTimeString() });
            localStorage.setItem(KEY_ERRORS, JSON.stringify(errors));
        }

        async skipToNextPatient() {
            this.currentIndex++;
            localStorage.setItem(KEY_INDEX, this.currentIndex.toString());
            this.log("エラーが発生したため、この患者をスキップして受付画面に戻ります...");
            await sleep(WAIT_MS);
            const receptionUrl = localStorage.getItem(KEY_RECEPTION_URL);
            if (receptionUrl) {
                window.location.href = receptionUrl;
            } else {
                window.history.back();
            }
        }

        checkCurrentPage() {
            const url = window.location.href;
            if (this.lastProcessedUrl === url) {
                console.log(`[DigikarAutoInput] URL unchanged, skipping checkCurrentPage: ${url}`);
                return;
            }
            console.log(`[DigikarAutoInput] checkCurrentPage URL: ${url}, isActive: ${this.isActive}`);
            if (url.includes('/reception/')) {
                // 受付一覧画面
                if (this.isActive) {
                    this.lastProcessedUrl = url;
                    this.currentIndex = parseInt(localStorage.getItem(KEY_INDEX) || '0');
                    console.log(`[DigikarAutoInput] Reception page detected. Starting index: ${this.currentIndex}`);
                    // ループ継続
                    this.processNextPatientAtReception();
                }
            } else if (url.includes('/karte/') || url.includes('/patients/')) {
                // カルテ詳細画面
                console.log(`[DigikarAutoInput] Karte page detected. isActive: ${this.isActive}`);
                if (this.isActive) {
                    this.lastProcessedUrl = url;
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

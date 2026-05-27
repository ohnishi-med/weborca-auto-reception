// ==UserScript==
// @name         WebORCA 自動受付ツール
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  スプレッドシートから曜日・クールの患者リストを取得し、自動受付を行います (UI自動埋め込み・安定版)
// @author       Tsuyoshi Ohnishi
// @match        *://weborca.cloud.orcamo.jp/*
// @match        https://weborca.cloud.orcamo.jp/client.html*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      script.google.com
// @connect      googleusercontent.com
// @updateURL    https://raw.githubusercontent.com/ohnishi-med/weborca-auto-reception/master/weborca_auto_reception.user.js
// @downloadURL  https://raw.githubusercontent.com/ohnishi-med/weborca-auto-reception/master/weborca_auto_reception.user.js
// ==/UserScript==

(function() {
  'use strict';
  console.log("WebORCA Auto Reception Loading...");

  // ================= 設定エリア =================
  // GAS APIのWebアプリURL（埋め込み済み）
  const GAS_API_URL = "https://script.google.com/macros/s/AKfycbypIiNLtxLDqVLFMt4A6-wf-_qy5tTun7sybU7Exe0NVvySMgnuUkukF7xbvOqBWd-TIA/exec";
  
  // 各操作のウェイト時間（ミリ秒）
  const WAIT_MS = 1000; 

  // デフォルトの診療科 (透析患者は "02 人工透析内" となります)
  const DEFAULT_DEPARTMENT = "02 人工透析内"; 

  // WebORCA 受付画面(U02)のDOMセレクタ
  const SELECTORS = {
    // 患者番号入力欄
    patientIdInput: '#U02\\.fixed1\\.PTNUM',
    
    // 患者検索後の名前表示領域（読み込み完了判定に使用）
    patientNameDisplay: '#U02\\.fixed1\\.NAME',
    
    // 保険組合せ入力欄 (4桁のコードを入力する欄)
    insuranceInput: '#U02\\.fixed1\\.HKNCOMBI',
    
    // 保険組合せリストテーブル
    insuranceTable: '#U02\\.fixed1\\.scrolledwindow3\\.HKNCOMBI_LIST',
    
    // 診療科コンボボックスの入力先
    departmentInput: '[id="U02.fixed1.SRYKA_COMBO.SRYKA"]',
    
    // 医師コンボボックスの入力先
    doctorInput: '[id="U02.fixed1.DRNAME_COMBO.DRNAME"]',
    
    // 受付完了ボタン
    registerBtn: '#U02\\.fixed1\\.B12',
    
    // 確認ダイアログのOKボタン（登録確認など）
    dialogOkBtn: '#ZID1\\.fixed1\\.B12, #ZID1\\.fixed1\\.B02, #ZID1\\.fixed1\\.B01, button[id$="B12"]',
    
    // エラー・警告ダイアログの閉じるボタン
    dialogCloseBtn: '#ZERR\\.fixed1\\.B01, #ZID1\\.fixed1\\.B01, button[id$="B01"]',
    
    // 二重登録などの警告ダイアログ領域
    dialogArea: '[id^="ZERR"], [id^="ZID1"], .dialog-content'
  };
  // =============================================

  // --- UIデザイン (ミントグリーン基調のプレミアムGlassmorphism) ---
  GM_addStyle(`
    #weborca-reception-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      padding: 20px;
      background: rgba(240, 253, 250, 0.75); /* 淡いミントグリーン */
      backdrop-filter: blur(12px);
      border: 1px solid rgba(204, 251, 241, 0.5);
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
      z-index: 99999;
      font-family: "Inter", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
      color: #0f172a;
    }
    #weborca-reception-panel h3 {
      margin: 0 0 15px 0;
      font-size: 15px;
      font-weight: 700;
      color: #0f766e;
      border-bottom: 2px solid rgba(13, 148, 136, 0.2);
      padding-bottom: 8px;
      cursor: move;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .reception-form-group {
      margin-bottom: 12px;
    }
    .reception-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 4px;
    }
    .reception-select, .reception-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid rgba(13, 148, 136, 0.25);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.9);
      font-size: 13px;
      color: #0f172a;
      box-sizing: border-box;
      transition: all 0.2s;
    }
    .reception-select:focus, .reception-input:focus {
      outline: none;
      border-color: #0d9488;
      box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.15);
    }
    .reception-flex {
      display: flex;
      gap: 8px;
    }
    .reception-flex > div {
      flex: 1;
    }
    .reception-btn-primary, .reception-btn-secondary {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .reception-btn-primary {
      background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);
    }
    .reception-btn-primary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(13, 148, 136, 0.35);
    }
    .reception-btn-primary:active {
      transform: translateY(0);
    }
    .reception-btn-secondary {
      background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
      color: #ffffff;
      display: none;
    }
    .reception-btn-secondary:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(239, 68, 68, 0.35);
    }
    .reception-btn-primary:disabled, .reception-btn-secondary:disabled {
      background: #cbd5e1;
      color: #64748b;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    #reception-status {
      margin-top: 15px;
      padding: 10px;
      background: rgba(15, 23, 42, 0.05);
      border-radius: 8px;
      font-size: 11px;
      color: #334155;
      max-height: 150px;
      overflow-y: auto;
      white-space: pre-wrap;
      border: 1px solid rgba(15, 23, 42, 0.08);
      font-family: monospace;
    }
    .log-success { color: #0d9488; }
    .log-error { color: #e11d48; font-weight: bold; }
    .log-info { color: #2563eb; }
  `);

  class WebOrcaAutoReception {
    constructor() {
      this.panel = null;
      this.statusEl = null;
      this.startBtn = null;
      this.startTodayBtn = null;
      this.stopBtn = null;
      this.daySelect = null;
      this.coolSelect = null;
      
      this.isRunning = false;
      this.isStopped = false;
      this.patientsQueue = [];
      this.targetDoctor = "";
      
      this.initScreenObserver();
    }

    initUI() {
      // ターゲットとする親要素（U02受付画面）を探す
      const u02 = document.getElementById('U02');
      if (!u02) return;

      // すでにパネルが存在すれば何もしない
      if (document.getElementById('weborca-reception-panel')) return;

      const div = document.createElement('div');
      div.id = 'weborca-reception-panel';
      
      // デフォルトの曜日・クールの自動設定
      const now = new Date();
      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      const currentDay = dayNames[now.getDay()];
      const currentCool = now.getHours() < 13 ? "午前" : "午後";

      div.innerHTML = `
        <h3>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          WebORCA 自動受付
        </h3>
        <div class="reception-flex reception-form-group">
          <div>
            <label class="reception-label">対象曜日</label>
            <select class="reception-select" id="reception-day">
              <option value="月" ${currentDay === '月' ? 'selected' : ''}>月曜日</option>
              <option value="火" ${currentDay === '火' ? 'selected' : ''}>火曜日</option>
              <option value="水" ${currentDay === '水' ? 'selected' : ''}>水曜日</option>
              <option value="木" ${currentDay === '木' ? 'selected' : ''}>木曜日</option>
              <option value="金" ${currentDay === '金' ? 'selected' : ''}>金曜日</option>
              <option value="土" ${currentDay === '土' ? 'selected' : ''}>土曜日</option>
              <option value="日" ${currentDay === '日' ? 'selected' : ''}>日曜日</option>
            </select>
          </div>
          <div>
            <label class="reception-label">クール</label>
            <select class="reception-select" id="reception-cool">
              <option value="午前" ${currentCool === '午前' ? 'selected' : ''}>午前</option>
              <option value="午後" ${currentCool === '午後' ? 'selected' : ''}>午後</option>
            </select>
          </div>
        </div>
        <button class="reception-btn-primary" id="reception-start">
          選択クールを受付
        </button>
        <button class="reception-btn-primary" id="reception-start-today" style="background: linear-gradient(135deg, #0f766e 0%, #115e59 100%); margin-top: 6px;">
          本日分（全クール）を受付
        </button>
        <button class="reception-btn-secondary" id="reception-stop">
          一時停止/中断
        </button>
        <div id="reception-status">待機中...</div>
      `;
      
      // bodyではなく、U02受付画面の要素の直下に追加する（これにより画面の非表示に追従する）
      u02.appendChild(div);

      this.panel = div;
      this.statusEl = div.querySelector('#reception-status');
      this.startBtn = div.querySelector('#reception-start');
      this.startTodayBtn = div.querySelector('#reception-start-today');
      this.stopBtn = div.querySelector('#reception-stop');
      this.daySelect = div.querySelector('#reception-day');
      this.coolSelect = div.querySelector('#reception-cool');

      this.startBtn.addEventListener('click', () => this.startProcess());
      this.startTodayBtn.addEventListener('click', () => this.startProcess("all"));
      this.stopBtn.addEventListener('click', () => this.stopProcess());

      // ドラッグ移動の実装
      const handle = div.querySelector('h3');
      let isDragging = false, startX, startY, origLeft, origTop;
      handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = div.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        origLeft = rect.left;
        origTop = rect.top;
        div.style.right = 'auto';
        div.style.left = origLeft + 'px';
        div.style.top = origTop + 'px';
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        div.style.left = (origLeft + e.clientX - startX) + 'px';
        div.style.top = (origTop + e.clientY - startY) + 'px';
      });
      document.addEventListener('mouseup', () => { isDragging = false; });
    }

    log(msg, type = "info") {
      if (!this.statusEl) return;
      const now = new Date().toLocaleTimeString();
      let classAttr = "";
      if (type === "success") classAttr = 'class="log-success"';
      if (type === "error") classAttr = 'class="log-error"';
      if (type === "info") classAttr = 'class="log-info"';

      const line = `<span ${classAttr}>[${now}] ${msg}</span><br/>`;
      this.statusEl.innerHTML = line + this.statusEl.innerHTML;
      console.log(`[WebORCA-Reception] ${msg}`);
    }

    /**
     * 画面の自動遷移用のオブザーバー初期化
     */
    initScreenObserver() {
      const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (let mutation of mutations) {
          if (mutation.type === 'childList' || 
              (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'class'))) {
            shouldCheck = true;
            break;
          }
        }
        if (shouldCheck) {
          this.checkScreenAndNavigate();
        }
      });

      observer.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: true, 
        attributeFilter: ['style', 'class'] 
      });

      [100, 500, 1000, 2000, 3000, 5000].forEach(delay => {
        setTimeout(() => this.checkScreenAndNavigate(), delay);
      });

      this.checkScreenAndNavigate();
    }

    /**
     * 要素が表示状態かどうかを判定するヘルパー
     */
    isElementVisible(el) {
      if (!el) return false;
      return el.style.display !== 'none' && !el.classList.contains('hidden');
    }

    /**
     * 現在の画面状態をチェックし、必要に応じて自動画面遷移・自動ログインを行う
     */
    checkScreenAndNavigate() {
      // 0. ログイン画面の検知と自動ログイン
      const userInput = document.querySelector('input[type="text"][name="user"], input[id="user"], input[type="text"]');
      const passInput = document.querySelector('input[type="password"][name="password"], input[id="password"], input[type="password"]');
      const loginBtn = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'))
        .find(el => {
          const text = (el.textContent || el.value || "").trim();
          return text === "ログイン" || text === "ログインする";
        });

      const hasMainWindows = document.getElementById('M00') || document.getElementById('M01') || document.getElementById('U02');
      if (userInput && passInput && loginBtn && !hasMainWindows) {
        if (userInput.value === "" && passInput.value === "") {
          console.log("[WebORCA-Reception] ログイン画面を検知。自動ログインを実行します...");
          this.setInputValue(userInput, "ormaster");
          this.setInputValue(passInput, "ormaster");
          
          setTimeout(() => {
            console.log("[WebORCA-Reception] ログインボタンをクリックします。");
            loginBtn.click();
          }, 600);
          return true;
        }
      }

      // 1. M00 (マスターメニュー) がアクティブな場合
      const m00 = document.getElementById('M00');
      if (this.isElementVisible(m00)) {
        const btn = document.querySelector('#M00\\.fixed1\\.G01');
        if (btn) {
          console.log("[WebORCA-Reception] マスターメニューを検知。「01 医事業務」をクリックして遷移します...");
          btn.click();
          return true;
        }
      }

      // 2. M01 (業務メニュー) がアクティブな場合
      const m01 = document.getElementById('M01');
      if (this.isElementVisible(m01)) {
        const btn = document.querySelector('#M01\\.fixed1\\.G11');
        if (btn) {
          console.log("[WebORCA-Reception] 業務メニューを検知。「11 受付」をクリックして遷移します...");
          btn.click();
          return true;
        }
      }

      // 3. U02 (受付画面) がアクティブな場合のみ自動受付パネルを作成して表示
      const u02 = document.getElementById('U02');
      if (this.isElementVisible(u02)) {
        if (!this.panel) {
          this.initUI();
        }
      }
      return false;
    }

    async startProcess(coolOverride = null) {
      if (this.isRunning) return;
      this.isRunning = true;
      this.isStopped = false;
      this.startBtn.disabled = true;
      if (this.startTodayBtn) this.startTodayBtn.disabled = true;
      this.stopBtn.style.display = "block";
      this.stopBtn.disabled = false;
      
      const day = this.daySelect.value;
      const cool = coolOverride || this.coolSelect.value;
      
      if (coolOverride === "all") {
        this.log(`${day}曜日の全スケジュール（午前・午後）の自動受付を開始します...`);
      } else {
        this.log(`${day}曜日・${cool}クールの自動受付を開始します...`);
      }

      try {
        this.log("スプレッドシート(GAS API)からデータ取得中...");
        const result = await this.fetchData(day, cool);
        
        this.patientsQueue = result.patients || [];
        this.targetDoctor = result.doctor || "";
        
        this.log(`対象患者: ${this.patientsQueue.length}件 取得しました。`);

        if (this.patientsQueue.length === 0) {
          this.log("対象の患者が存在しないため、処理を終了します。", "success");
          this.resetButtons();
          return;
        }

        // 2. 自動受付ループを実行
        for (let i = 0; i < this.patientsQueue.length; i++) {
          if (this.isStopped) {
            this.log("一時停止されました。", "error");
            break;
          }

          const patient = this.patientsQueue[i];
          this.log(`処理中 (${i + 1}/${this.patientsQueue.length}): 患者ID ${patient.patientId} (${patient.cool || '共通'})`);
          
          try {
            await this.processReception(patient);
            this.log(`成功: 患者ID ${patient.patientId}`, "success");
          } catch (patientErr) {
            this.log(`失敗: 患者ID ${patient.patientId} - ${patientErr.message}`, "error");
            this.isStopped = true;
            this.log("安全のため自動処理を一時停止しました。再開する場合は再度開始ボタンを押してください。", "error");
            break;
          }
        }

        if (!this.isStopped) {
          this.log("すべての患者の受付処理が完了しました！", "success");
        }

      } catch (err) {
        this.log(`システムエラー: ${err.message}`, "error");
      } finally {
        this.resetButtons();
      }
    }

    stopProcess() {
      this.isStopped = true;
      this.stopBtn.disabled = true;
      this.log("中断指示を受信しました。現在の処理完了後に一時停止します。");
    }

    resetButtons() {
      this.isRunning = false;
      this.startBtn.disabled = false;
      if (this.startTodayBtn) this.startTodayBtn.disabled = false;
      this.stopBtn.style.display = "none";
    }

    fetchData(day, cool) {
      return new Promise((resolve, reject) => {
        if (GAS_API_URL.includes("YOUR_GAS_API_ID")) {
          reject(new Error("GAS_API_URLが初期設定のままです。実際のURLを貼り付けてください。"));
          return;
        }

        const url = `${GAS_API_URL}?day=${encodeURIComponent(day)}&cool=${encodeURIComponent(cool)}`;
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          onload: (res) => {
            try {
              const json = JSON.parse(res.responseText);
              if (json.status === "success") {
                resolve(json);
              } else {
                reject(new Error(json.message || "GAS側でのエラーが発生しました"));
              }
            } catch (e) {
              reject(new Error("JSONデータの解析に失敗しました。"));
            }
          },
          onerror: (err) => {
            reject(new Error("GASとの通信エラーが発生しました。ネットワークまたは公開範囲設定をご確認ください。"));
          }
        });
      });
    }

    async processReception(patient) {
      // 1. 患者ID入力欄の待機と入力
      const idInput = await this.waitForSelector(SELECTORS.patientIdInput);
      this.setInputValue(idInput, patient.patientId);
      await this.sleep(300);
      
      // Enterキー押下で検索
      this.simulateEnter(idInput);
      
      // 2. 患者情報が読み込まれるのを待つ (名前表示欄 of U02 を監視)
      await this.sleep(WAIT_MS);

      // --- エラー・警告チェック（ID入力後のチェック） ---
      const errorMsg = await this.checkDialogErrors();
      if (errorMsg) {
        throw new Error(`検索時にエラーが発生しました: ${errorMsg}`);
      }

      // 3. 保険区分（保険組合せ）の選択
      if (patient.insuranceType) {
        this.log(`保険区分「${patient.insuranceType}」を探しています...`);
        const table = document.querySelector(SELECTORS.insuranceTable);
        const insuranceInput = document.querySelector(SELECTORS.insuranceInput);
        
        if (table && insuranceInput) {
          const rows = table.querySelectorAll('tbody tr');
          let matchedRow = null;
          let combinationCode = "";

          for (let row of rows) {
            const text = row.textContent || "";
            if (text.includes(patient.insuranceType)) {
              matchedRow = row;
              const firstTd = row.querySelector('td, th');
              if (firstTd) {
                combinationCode = firstTd.textContent.trim();
              }
              break;
            }
          }

          if (matchedRow) {
            this.log("合致する保険組合せを見つけました: [" + combinationCode + "] " + patient.insuranceType);
            matchedRow.click();
            await this.sleep(300);

            if (combinationCode) {
              this.setInputValue(insuranceInput, combinationCode);
              this.simulateEnter(insuranceInput);
              await this.sleep(400);
            }
          } else {
            this.log("警告: 保険区分「" + patient.insuranceType + "」がWebORCAの組合せリストに見つかりませんでした。", "error");
          }
        }
      }

      // 4. 診療科の選択（"02 人工透析内"）
      if (DEFAULT_DEPARTMENT) {
        const depInput = document.querySelector(SELECTORS.departmentInput);
        if (depInput) {
          this.log(`診療科「${DEFAULT_DEPARTMENT}」を設定します...`);
          this.setInputValue(depInput, DEFAULT_DEPARTMENT);
          this.simulateEnter(depInput);
          await this.sleep(400);
        }
      }

      // 5. 医師（担当医）の選択 (患者個別の医師設定を最優先)
      const doctorToSelect = patient.doctor || this.targetDoctor;
      if (doctorToSelect && doctorToSelect !== "未設定") {
        const docInput = document.querySelector(SELECTORS.doctorInput);
        if (docInput) {
          this.log(`担当医師「${doctorToSelect}」を設定します...`);
          this.setInputValue(docInput, doctorToSelect);
          this.simulateEnter(docInput);
          await this.sleep(400);
        }
      }

      // 6. 受付完了/登録ボタンをクリック (F12)
      const regBtn = await this.waitForSelector(SELECTORS.registerBtn);
      regBtn.click();
      await this.sleep(WAIT_MS);

      // --- ダイアログ・警告のハンドリング ---
      let attempts = 0;
      while (attempts < 3) {
        const dialog = document.querySelector(SELECTORS.dialogArea);
        if (dialog) {
          const text = dialog.textContent || "";
          
          if (text.includes('重複') || text.includes('警告') || text.includes('エラー') || text.includes('期限切れ')) {
            const closeBtn = document.querySelector(SELECTORS.dialogCloseBtn);
            if (closeBtn) {
              closeBtn.click();
            } else {
              this.simulateEnter(document.activeElement);
            }
            await this.sleep(500);
            throw new Error(`警告メッセージ: ${text.trim().substring(0, 100)}`);
          }

          const okBtn = document.querySelector(SELECTORS.dialogOkBtn);
          if (okBtn) {
            okBtn.click();
            await this.sleep(WAIT_MS);
            break;
          } else {
            this.simulateEnter(document.activeElement);
            await this.sleep(WAIT_MS);
          }
        }
        attempts++;
        await this.sleep(300);
      }

      await this.sleep(WAIT_MS);
    }

    async checkDialogErrors() {
      const dialog = document.querySelector(SELECTORS.dialogArea);
      if (dialog) {
        const text = dialog.textContent || "";
        const closeBtn = document.querySelector(SELECTORS.dialogCloseBtn);
        if (closeBtn) {
          closeBtn.click();
        } else {
          this.simulateEnter(document.activeElement);
        }
        await this.sleep(500);
        return text.trim();
      }
      return null;
    }

    async sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async waitForSelector(selector, timeout = 8000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el) return el;
        await this.sleep(200);
      }
      throw new Error(`要素が見つかりませんでした: ${selector}`);
    }

    setInputValue(el, value) {
      if (!el) return;
      el.focus();
      if (typeof el.select === 'function') {
        el.select();
      }
      const success = document.execCommand('insertText', false, value);
      if (!success) {
        el.value = value;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    simulateEnter(el) {
      if (!el) return;
      const options = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
      el.dispatchEvent(new KeyboardEvent('keydown', options));
      el.dispatchEvent(new KeyboardEvent('keypress', options));
      el.dispatchEvent(new KeyboardEvent('keyup', options));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new WebOrcaAutoReception());
  } else {
    setTimeout(() => new WebOrcaAutoReception(), 1000);
  }
})();

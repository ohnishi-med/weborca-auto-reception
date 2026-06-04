/**
 * WebORCA 自動受付システム用 GAS API
 * スプレッドシートから指定された曜日・クールの患者リストと担当医を抽出し、JSON形式で返却します。
 */

// --- 設定エリア ---
// シート名
const SHEET_NAME_PATIENTS = "patient_list";
const SHEET_NAME_DOCTORS = "HD_Dr";

// HD_Dr シートの設定 (横持ちマトリックス構造)
const DOCTOR_COL_COOL_LABEL = 0;      // A列: クールラベル ("AM" または "PM")
// ------------------

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const patientSheet = ss.getSheetByName(SHEET_NAME_PATIENTS);
    const doctorSheet = ss.getSheetByName(SHEET_NAME_DOCTORS);

    if (!patientSheet || !doctorSheet) {
      return createJsonResponse({
        status: "error",
        message: `必要なシートが見つかりません。シート名 [${SHEET_NAME_PATIENTS}] または [${SHEET_NAME_DOCTORS}] を確認してください。`
      });
    }

    // 1. 患者リストの取得とヘッダー列の自動解析
    const patientData = patientSheet.getDataRange().getValues();
    const headerRow = patientData[0];
    
    // デフォルト値 (A列: ID, B列: 保険, C列: 曜日, D列: クール)
    let colId = 0;
    let colInsurance = 1;
    let colDay = 2;
    let colCool = 3;
    
    // ヘッダー文字列から列インデックスを自動的に検出 (順不同や「氏名」列が挟まれている場合に対応)
    for (let col = 0; col < headerRow.length; col++) {
      const headerName = String(headerRow[col] || "").trim();
      if (headerName.indexOf("ID") !== -1 || headerName.indexOf("番号") !== -1 || headerName.indexOf("コード") !== -1) {
        colId = col;
      } else if (headerName.indexOf("保険") !== -1 || headerName.indexOf("区分") !== -1 || headerName.indexOf("種別") !== -1) {
        colInsurance = col;
      } else if (headerName.indexOf("曜日") !== -1) {
        colDay = col;
      } else if (headerName.indexOf("クール") !== -1 || headerName.indexOf("時間") !== -1 || headerName.indexOf("時間帯") !== -1 || headerName.indexOf("午前/午後") !== -1) {
        colCool = col;
      }
    }

    // デバッグ情報をログに出力（GAS の実行ログで確認可）
    Logger.log({
      detectedColumns: {
        id: colId,
        insurance: colInsurance,
        day: colDay,
        cool: colCool
      },
      headerSample: headerRow.slice(0, 5)
    });

    // デバッグパラメータが指定された場合はスプレッドシートの構造情報を返す
    if (e && e.parameter && e.parameter.debug === "1") {
      const debugInfo = {
        status: "debug",
        message: "スプレッドシートの構造情報をダンプしました。",
        detectedColumns: {
          "患者ID列": { index: colId, name: headerRow[colId] },
          "保険区分列": { index: colInsurance, name: headerRow[colInsurance] },
          "曜日列": { index: colDay, name: headerRow[colDay] },
          "クール列": { index: colCool, name: headerRow[colCool] }
        },
        patientHeaders: headerRow,
        patientSampleRow: patientData.length > 1 ? patientData[1] : null,
        doctorHeaders: doctorSheet.getDataRange().getValues()[0]
      };
      // 追加でログ出力して確認しやすくする
      Logger.log(JSON.stringify(debugInfo, null, 2));
      return createJsonResponse(debugInfo);
    }

    // クエリパラメータから曜日とクールを取得
    let targetDay = e && e.parameter && e.parameter.day;
    let targetCool = e && e.parameter && e.parameter.cool; // "午前", "午後", "all", "AM", "PM"
    
    // クエリパラメータから日付を取得 (例: "20260603" など)
    let targetDateStr = e && e.parameter && e.parameter.date;
    let targetDate = new Date();
    if (targetDateStr && /^\d{8}$/.test(targetDateStr)) {
      const y = parseInt(targetDateStr.substring(0, 4));
      const m = parseInt(targetDateStr.substring(4, 6)) - 1;
      const d = parseInt(targetDateStr.substring(6, 8));
      targetDate = new Date(y, m, d);
    }

    // 曜日の表記ゆらぎ吸収用の検索文字定義 (例: "水曜日" -> "水")
    let searchDay = targetDay;
    if (searchDay && searchDay.length > 1) {
      searchDay = searchDay.replace("曜日", "").trim();
    }

    // パラメータ未指定時の自動判定ロジック
    if (!targetDay || !targetCool) {
      // 指定の日付から曜日を判定 (0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土)
      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      const currentDay = dayNames[targetDate.getDay()];

      // クール判定 (13:00以前は午前、それ以降は午後とする)
      const currentHour = targetDate.getHours();
      const currentCool = currentHour < 13 ? "午前" : "午後";

      if (!targetDay) {
        targetDay = currentDay;
        searchDay = currentDay;
      }
      if (!targetCool) targetCool = currentCool;
    }

    // 2. 担当医マッピングの作成 (HD_Drシート - 横持ちマトリックスからAM/PM両方の医師を取得)
    const doctorData = doctorSheet.getDataRange().getValues();
    const doctorsMap = {
      "午前": "未設定",
      "午後": "未設定"
    };
    
    // 曜日の列インデックスを探す (1行目: B1〜H1 から検索)
    const doctorHeaderRow = doctorData[0];
    let doctorColIndex = -1;
    for (let col = 1; col < doctorHeaderRow.length; col++) {
      const headerVal = String(doctorHeaderRow[col] || "").trim();
      // "月" または "月曜日" のように部分一致を含めて判定
      if (headerVal === searchDay || headerVal.indexOf(searchDay) !== -1 || searchDay.indexOf(headerVal) !== -1) {
        doctorColIndex = col;
        break;
      }
    }

    if (doctorColIndex !== -1) {
      for (let row = 1; row < doctorData.length; row++) {
        const cellVal = String(doctorData[row][DOCTOR_COL_COOL_LABEL] || "").trim().toUpperCase();
        if (cellVal === "AM") {
          doctorsMap["午前"] = String(doctorData[row][doctorColIndex] || "").trim();
        } else if (cellVal === "PM") {
          doctorsMap["午後"] = String(doctorData[row][doctorColIndex] || "").trim();
        }
      }
    }

    // 3. 患者リストの取得 (自動検出したインデックス値を使用)
    const patients = [];

    // ヘッダー行を除いて抽出
    for (let i = 1; i < patientData.length; i++) {
      const row = patientData[i];
      const patientId = String(row[colId] || "").trim();
      const insuranceType = String(row[colInsurance] || "").trim();
      const day = String(row[colDay] || "").trim();
      const cool = String(row[colCool] || "").trim();

      // 患者IDがあり、かつ曜日が一致する場合 ("月水金" などの連結表記に対応するため部分一致判定)
      if (patientId && (day === searchDay || day.indexOf(searchDay) !== -1)) {
        
        // クールの判定 (targetCoolが "all" の場合は全て合致とする)
        const isCoolMatch = (targetCool === "all") || 
                            (cool === targetCool || 
                             (targetCool === "午前" && (cool === "午前" || cool === "AM")) || 
                             (targetCool === "午後" && (cool === "午後" || cool === "PM")));

        if (isCoolMatch) {
          // 患者のスケジュール（クール）に応じた医師を紐づける
          const patientCool = (cool === "午前" || cool === "AM") ? "午前" : "午後";
          const assignedDoctor = doctorsMap[patientCool] || "未設定";

          // J-M列 (インデックス 9, 10, 11, 12) の値を取得
          const insVal = String(row[9] || "").trim();
          const pub1Val = String(row[10] || "").trim();
          const pub2Val = String(row[11] || "").trim();
          const pub3Val = String(row[12] || "").trim();

          // N, O列 (インデックス 13, 14) の値を取得 (デジカル用カルテテキスト・コスト)
          const digikarKarteVal = String(row[13] || "").trim();
          let digikarCostVal = String(row[14] || "").trim();

          // スプレッドシートが空欄の場合、自動判定されたセット名を割り当て
          if (!digikarCostVal) {
            digikarCostVal = determineSet(targetDate, patientCool);
          }

          patients.push({
            patientId: patientId,
            insuranceType: insVal,
            publicFund1: pub1Val,
            publicFund2: pub2Val,
            publicFund3: pub3Val,
            cool: patientCool,
            doctor: assignedDoctor,
            digikarKarte: digikarKarteVal,
            digikarCost: digikarCostVal
          });
        }
      }
    }

    // デフォルトの医師（従来互換性のためのfallback）
    let defaultDoctor = doctorsMap[targetCool] || "未設定";
    if (targetCool === "all") {
      defaultDoctor = "午前: " + doctorsMap["午前"] + " / 午後: " + doctorsMap["午後"];
    }

    return createJsonResponse({
      status: "success",
      query: {
        day: targetDay,
        cool: targetCool
      },
      doctor: defaultDoctor,
      doctorsMap: doctorsMap,
      patients: patients
    });

  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * 実行日付とクールから自動入力用のセット名を算出します。
 */
function determineSet(date, cool) {
  const dayNum = date.getDate();
  const dayOfWeek = date.getDay(); // 0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土

  // 1. 初回判定 (第1月曜日[1] または 第1火曜日[2] = 日付が7以下で曜日が月火)
  const isFirstMonOrTue = (dayNum <= 7) && (dayOfWeek === 1 || dayOfWeek === 2);
  
  // 2. 土曜午後判定
  const isSatPM = (dayOfWeek === 6) && (cool === "午後" || cool === "PM");

  if (isFirstMonOrTue) {
    return isSatPM ? "auto_HD_月初回_土曜午後" : "auto_HD_月初回_通常";
  } else {
    return isSatPM ? "auto_HD_土曜午後" : "auto_HD_通常";
  }
}

/**
 * JSON形式のレスポンスを出力するヘルパー関数
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * WebORCA 自動受付システム用 GAS API
 * スプレッドシートから指定された曜日・クールの患者リストと担当医を抽出し、JSON形式で返却します。
 */

// --- 設定エリア ---
// シート名
const SHEET_NAME_PATIENTS = "patient_list";
const SHEET_NAME_DOCTORS = "HD_Dr";

// patient_list シートの列インデックス (0始まり)
const PATIENT_COL_ID = 0;             // A列: 患者ID
const PATIENT_COL_INSURANCE = 1;      // B列: 保険区分
const PATIENT_COL_DAY = 2;            // C列: 曜日
const PATIENT_COL_COOL = 3;           // D列: クール (午前/午後)

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

    // クエリパラメータから曜日とクールを取得
    let targetDay = e && e.parameter && e.parameter.day;
    let targetCool = e && e.parameter && e.parameter.cool; // "午前", "午後", "all", "AM", "PM"

    // パラメータ未指定時の自動判定ロジック
    if (!targetDay || !targetCool) {
      const now = new Date();
      
      // 日本時間の曜日判定 (0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土)
      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      const currentDay = dayNames[now.getDay()];

      // クール判定 (13:00以前は午前、それ以降は午後とする)
      const currentHour = now.getHours();
      const currentCool = currentHour < 13 ? "午前" : "午後";

      if (!targetDay) targetDay = currentDay;
      if (!targetCool) targetCool = currentCool;
    }

    // 1. 担当医マッピングの作成 (HD_Drシート - 横持ちマトリックスからAM/PM両方の医師を取得)
    const doctorData = doctorSheet.getDataRange().getValues();
    const doctorsMap = {
      "午前": "未設定",
      "午後": "未設定"
    };
    
    // 曜日の列インデックスを探す (1行目: B1〜H1 から検索)
    const headerRow = doctorData[0];
    let colIndex = -1;
    for (let col = 1; col < headerRow.length; col++) {
      const headerVal = String(headerRow[col] || "").trim();
      // "月" または "月曜日" のように部分一致を含めて判定
      if (headerVal === targetDay || headerVal.indexOf(targetDay) === 0 || targetDay.indexOf(headerVal) === 0) {
        colIndex = col;
        break;
      }
    }

    if (colIndex !== -1) {
      for (let row = 1; row < doctorData.length; row++) {
        const cellVal = String(doctorData[row][DOCTOR_COL_COOL_LABEL] || "").trim().toUpperCase();
        if (cellVal === "AM") {
          doctorsMap["午前"] = String(doctorData[row][colIndex] || "").trim();
        } else if (cellVal === "PM") {
          doctorsMap["午後"] = String(doctorData[row][colIndex] || "").trim();
        }
      }
    }

    // 2. 患者リストの取得 (patient_listシート)
    const patientData = patientSheet.getDataRange().getValues();
    const patients = [];

    // ヘッダー行を除いて抽出
    for (let i = 1; i < patientData.length; i++) {
      const row = patientData[i];
      const patientId = String(row[PATIENT_COL_ID] || "").trim();
      const insuranceType = String(row[PATIENT_COL_INSURANCE] || "").trim();
      const day = String(row[PATIENT_COL_DAY] || "").trim();
      const cool = String(row[PATIENT_COL_COOL] || "").trim();

      // 患者IDがあり、かつ曜日が一致する場合
      if (patientId && (day === targetDay || day.indexOf(targetDay) === 0 || targetDay.indexOf(day) === 0)) {
        
        // クールの判定 (targetCoolが "all" の場合は全て合致とする)
        const isCoolMatch = (targetCool === "all") || 
                            (cool === targetCool || 
                             (targetCool === "午前" && (cool === "午前" || cool === "AM")) || 
                             (targetCool === "午後" && (cool === "午後" || cool === "PM")));

        if (isCoolMatch) {
          // 患者のスケジュール（クール）に応じた医師を紐づける
          const patientCool = (cool === "午前" || cool === "AM") ? "午前" : "午後";
          const assignedDoctor = doctorsMap[patientCool] || "未設定";

          patients.push({
            patientId: patientId,
            insuranceType: insuranceType,
            cool: patientCool,
            doctor: assignedDoctor
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
 * JSON形式のレスポンスを出力するヘルパー関数
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

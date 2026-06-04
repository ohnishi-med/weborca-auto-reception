# anonymize.ps1
# HTMLファイルに含まれる患者の個人情報をダミー名に置換します。

$receptionPath = "c:\Users\coino\AntigravityWorkspace\projects\tools\weborca-auto-reception\Reception.html"
if (Test-Path $receptionPath) {
    Write-Host "Anonymizing Reception.html..."
    $content = Get-Content -Path $receptionPath -Raw -Encoding UTF8
    
    # 個別置換
    $content = $content.Replace("佐藤　芳美", "佐藤　太郎")
    $content = $content.Replace("サトウ　ヨシミ", "サトウ　タロウ")
    $content = $content.Replace("古暮　ふさ", "古暮　花子")
    $content = $content.Replace("コグレ　フサ", "コグレ　ハナコ")
    $content = $content.Replace("福田　真理絵", "福田　二郎")
    $content = $content.Replace("フクダ　マリエ", "フクダ　ジロウ")
    $content = $content.Replace("コウノ　マルティナ　アリゴレー", "コウノ　マルティナ")
    $content = $content.Replace("ＫＯＮＯ　ＭＡＲＴＩＮＡ　ＡＲＩＧＯＲＥ", "ＫＯＮＯ　ＭＡＲＴＩＮＡ")

    Set-Content -Path $receptionPath -Value $content -Encoding UTF8
    Write-Host "Reception.html anonymized."
}

$kartePath = "c:\Users\coino\AntigravityWorkspace\projects\tools\weborca-auto-reception\karte.html"
if (Test-Path $kartePath) {
    Write-Host "Anonymizing karte.html..."
    $content = Get-Content -Path $kartePath -Raw -Encoding UTF8

    # 個別置換
    $content = $content.Replace("山本　美香", "山本　梅子")
    $content = $content.Replace("ヤマモト　ミカ", "ヤマモト　ウメコ")

    Set-Content -Path $kartePath -Value $content -Encoding UTF8
    Write-Host "karte.html anonymized."
}

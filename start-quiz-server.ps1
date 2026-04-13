# Serves the Review folder so /quiz/ can fetch ../CPS630_PractiseQuestionBank.json
# Open: http://localhost:8765/quiz/
Set-Location $PSScriptRoot
Write-Host "Quiz: http://localhost:8765/quiz/" -ForegroundColor Cyan
python -m http.server 8765

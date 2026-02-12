# Maestro Test Template (FootballCoach)

Copy these files into your Maestro workspace folder.

## 1) Set app id (PowerShell)

iOS:
```powershell
$env:APP_ID="com.erichsen.footballcoach"
```

Android:
```powershell
$env:APP_ID="com.anonymous.FootballCoach"
```

## 2) Run one test

```powershell
maestro test .\01-login.yaml
```

## 3) Run all tests

```powershell
maestro test .
```

## Notes

- These are simple smoke tests for your new `testID`s.
- Some tests need you to be logged in and/or already on the right screen.
- If navigation text differs on your device language, update `tapOn` text lines.

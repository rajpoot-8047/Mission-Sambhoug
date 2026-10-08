@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo  BUILDING ANDROID APK: Mission Sambhoug 3D Ludo
echo ========================================================

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=C:\Users\Rajpoot\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo 1. Syncing latest web assets...
call npx cap copy android
if errorlevel 1 (
    echo [ERROR] Capacitor copy failed.
    exit /b 1
)

echo 2. Running Gradle build...
cd /d d:\Ludo-own\android
call gradlew.bat :app:assembleDebug -x lint -x test --no-daemon
if errorlevel 1 (
    echo [ERROR] Gradle build failed.
    exit /b 1
)

cd /d d:\Ludo-own
if exist "android\app\build\outputs\apk\debug\app-debug.apk" (
    copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "d:\Ludo-own\Mission_Sambhoug_3D_Ludo.apk" >nul
    echo.
    echo ========================================================
    echo  [SUCCESS] APK RELEASE BUILD COMPLETED!
    echo  Output: d:\Ludo-own\Mission_Sambhoug_3D_Ludo.apk
    echo ========================================================
) else (
    echo [ERROR] Could not find built APK file.
    exit /b 1
)

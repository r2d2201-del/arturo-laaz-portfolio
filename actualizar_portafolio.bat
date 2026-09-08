@echo off
title Actualizar Portafolio
echo ==================================================
echo   Iniciando actualizacion de videos...
echo ==================================================
echo.

python update_portfolio.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Intentando con el comando 'py' en lugar de 'python'...
    py update_portfolio.py
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Error: No se pudo ejecutar el script.
    echo Asegurate de tener Python instalado y agregado al PATH de Windows.
)

echo.
echo ==================================================
echo   Proceso terminado. Presiona una tecla para salir.
echo ==================================================
pause

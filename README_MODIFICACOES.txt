INVENTORBLOCKS - ALTERAÇÕES USB + BLE
=====================================

- Firmware ESP32-S3 agora aceita comandos por USB Serial e Bluetooth Low Energy.
- Adicionado serviço BLE UART/NUS com características RX e TX.
- Adicionado botão "Conectar Bluetooth" na interface.
- Adicionado estado separado para USB e Bluetooth LE.
- USB e BLE podem permanecer conectados simultaneamente.
- O último canal selecionado é usado para executar os blocos.
- Respostas são devolvidas pelo mesmo canal que originou o comando.
- LerBotao foi implementado também no firmware.
- Mantido o mapeamento D0=GPIO4, D1=GPIO5, D2=GPIO6 e D3=GPIO7.
- Corrigido o fechamento da função loop() no código Arduino exibido pela página.

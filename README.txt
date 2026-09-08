INVENTORBLOCKS - ESP32-S3 - USB + BLUETOOTH LE
===============================================

Esta versão permite executar os mesmos blocos do InventorBlocks por:

1. USB usando Web Serial.
2. Bluetooth Low Energy usando Web Bluetooth.

PORTAS LÓGICAS
---------------
D0 = GPIO 4
D1 = GPIO 5
D2 = GPIO 6
D3 = GPIO 7

FIRMWARE
--------
Abra:
firmware/esp32s3_inventorblocks/esp32s3_inventorblocks.ino

Na Arduino IDE, para comunicação pelo USB nativo do ESP32-S3, use:
Tools > USB CDC On Boot > Enabled

O firmware cria um dispositivo BLE chamado:
INVENTORBLOCKS-S3

O Bluetooth usa BLE (Low Energy), não Bluetooth clássico.

PROTOCOLO BLE
-------------
Serviço UART/NUS:
6e400001-b5a3-f393-e0a9-e50e24dcca9e

RX - navegador envia comandos:
6e400002-b5a3-f393-e0a9-e50e24dcca9e

TX - ESP32 envia respostas por notify:
6e400003-b5a3-f393-e0a9-e50e24dcca9e

COMANDOS
--------
PING
LigarLed D0
DesligarLed D0
LigarSirene D1
DesligarSirene D1
LerBotao D2

LerBotao usa INPUT_PULLUP. Ligue o botão entre a porta selecionada e GND.
Pressionado = 1; solto = 0.

NAVEGADOR
---------
USB/Web Serial: navegador com suporte a Web Serial, como Chrome/Edge em plataformas compatíveis.

Bluetooth/Web Bluetooth: exige navegador com Web Bluetooth e contexto seguro (HTTPS).
Em celular/tablet, o uso mais direto é em um navegador Android compatível com Web Bluetooth.
O suporte varia entre navegadores e sistemas operacionais.

USO
---
1. Grave o firmware no ESP32-S3.
2. Abra o InventorBlocks.
3. Para USB, clique em "Conectar USB".
4. Para BLE, clique em "Conectar Bluetooth" e escolha INVENTORBLOCKS-S3.
5. Monte os blocos e clique em "Executar".

Se USB e BLE estiverem conectados ao mesmo tempo, o InventorBlocks envia pelo canal ativo.
O último canal conectado/selecionado passa a ser o ativo. Isso evita executar comandos duas vezes.

#!/bin/bash
# Renderiza el vídeo demo de 10 s de NexoDesk a partir del screencast crudo.
set -e
RAW=/tmp/nexodesk-demo-raw.webm
OUT=/home/z/my-project/download/nexodesk-demo-10s.mp4
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf

ffmpeg -y -v error -i "$RAW" -filter_complex "\
[0:v]trim=start=16.6:end=18.8,setpts=PTS-STARTPTS[a];\
[0:v]trim=start=23.3:end=31.2,setpts=PTS-STARTPTS[b];\
[a][b]concat=n=2:v=1[seq];\
[seq]drawtext=fontfile=${FONT}:text='El cliente describe su problema en el portal':x=(w-text_w)/2:y=h-64:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=12:enable='between(t,0.2,3.1)',\
drawtext=fontfile=${FONT}:text='Cero toque — ticket creado y enrutado al instante':x=(w-text_w)/2:y=h-64:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=12:enable='between(t,3.4,5.7)',\
drawtext=fontfile=${FONT}:text='Llega a la bandeja única en tiempo real · Finanzas · Crítica':x=(w-text_w)/2:y=h-64:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=12:enable='between(t,5.9,10.1)',\
fade=t=in:st=0:d=0.35,fade=t=out:st=9.7:d=0.4,format=yuv420p[out]" \
-map "[out]" -c:v libx264 -preset medium -crf 20 -r 30 -movflags +faststart -an "$OUT"

echo "--- resultado ---"
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$OUT"

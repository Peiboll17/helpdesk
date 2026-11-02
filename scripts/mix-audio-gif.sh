#!/bin/bash
# Mezcla voz en off + cama musical sutil, mux con el vídeo y exporta GIF.
set -e
V=/tmp/voz
OUT=/home/z/my-project/download
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf

# 1) Ajuste de tempo fino de v2 y v3
ffmpeg -y -v error -i $V/v2b_t.wav -af "atempo=1.12" $V/v2_final.wav
ffmpeg -y -v error -i $V/v3b_t.wav -af "atempo=1.18" $V/v3_final.wav

# 2) Cama musical: pad ambiental (acorde La mayor, muy suave, con respiración lenta)
ffmpeg -y -v error \
 -f lavfi -i "sine=frequency=110:duration=10.2" \
 -f lavfi -i "sine=frequency=164.81:duration=10.2" \
 -f lavfi -i "sine=frequency=220:duration=10.2" \
 -f lavfi -i "sine=frequency=277.18:duration=10.2" \
 -filter_complex "[0][1][2][3]amix=inputs=4:normalize=1,tremolo=f=0.4:d=0.5,lowpass=f=950,volume=0.67,afade=t=in:st=0:d=1.2,afade=t=out:st=8.4:d=1.8[bed]" \
 -map "[bed]" -ar 24000 $V/bed.wav
echo -n "bed → "; ffmpeg -i $V/bed.wav -af volumedetect -f null - 2>&1 | grep max_volume

# 3) Mezcla final: 3 voces posicionadas + cama
ffmpeg -y -v error \
 -i $V/v1_t.wav -i $V/v2_final.wav -i $V/v3_final.wav -i $V/bed.wav \
 -filter_complex "\
[0:a]adelay=450:all=1,volume=1.0[s1];\
[1:a]adelay=3550:all=1,volume=1.0[s2];\
[2:a]adelay=6300:all=1,volume=1.0[s3];\
[3:a]anull[bd];\
[s1][s2][s3][bd]amix=inputs=4:normalize=0,afade=t=out:st=9.55:d=0.5,alimiter=limit=0.95[mix]" \
 -map "[mix]" -ar 44100 -ac 2 $V/mix.wav

# 4) Mux con el vídeo (vídeo sin recodificar)
ffmpeg -y -v error -i $OUT/nexodesk-demo-10s.mp4 -i $V/mix.wav \
 -c:v copy -c:a aac -b:a 192k -shortest $OUT/nexodesk-demo-10s-con-audio.mp4

# 5) GIF para web (paleta optimizada)
ffmpeg -y -v error -i $OUT/nexodesk-demo-10s-con-audio.mp4 -vf "fps=12,scale=640:-1:flags=lanczos,palettegen=max_colors=128" $V/pal.png
ffmpeg -y -v error -i $OUT/nexodesk-demo-10s-con-audio.mp4 -i $V/pal.png -lavfi "fps=12,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" $OUT/nexodesk-demo.gif

echo "--- entregables ---"
for f in nexodesk-demo-10s-con-audio.mp4 nexodesk-demo.gif; do
  echo -n "$f: "; ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$OUT/$f" | tr '\n' ' '
  stat -c "%s bytes" "$OUT/$f"
done

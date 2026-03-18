with open('c:/Users/Ayaan/Desktop/Modules/mobCloudX/videoTranscoding/container/transcode.service.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
del lines[50:298]
with open('c:/Users/Ayaan/Desktop/Modules/mobCloudX/videoTranscoding/container/transcode.service.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)

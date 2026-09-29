import subprocess

QUEUE = "media:queue"


def convert_one(job: dict) -> str:
    src, dst = job["src"], job["dst"]
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-c:v", "libx264", "-crf", "18", dst],
        check=True,
    )
    return dst


def run() -> None:
    while True:  # читаем очередь из Redis и конвертируем по одному файлу
        ...

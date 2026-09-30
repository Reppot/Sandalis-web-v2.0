import asyncio
import shutil
from pathlib import Path


class FfmpegConversionError(RuntimeError):
    pass


async def convert_video(
    input_path: str | Path,
    output_path: str | Path,
    video_codec: str = "libx264",
    audio_codec: str = "aac",
) -> None:
    ffmpeg_path = shutil.which("ffmpeg")

    if ffmpeg_path is None:
        raise FfmpegConversionError(
            "ffmpeg executable was not found",
        )

    source = Path(input_path).resolve()
    destination = Path(output_path).resolve()

    if not source.is_file():
        raise FfmpegConversionError(
            f"Input video does not exist: {source}",
        )

    if source == destination:
        raise FfmpegConversionError(
            "Input and output paths must be different",
        )

    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    process = await asyncio.create_subprocess_exec(
        ffmpeg_path,
        "-y",
        "-i",
        str(source),
        "-c:v",
        video_codec,
        "-c:a",
        audio_codec,
        str(destination),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )

    _, stderr = await process.communicate()

    if process.returncode != 0:
        error_text = stderr.decode(
            "utf-8",
            errors="replace",
        ).strip()

        raise FfmpegConversionError(
            error_text or "ffmpeg conversion failed",
        )
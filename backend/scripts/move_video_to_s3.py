import boto3

BUCKET = "sandalis-media"


def main() -> None:
    s3 = boto3.client("s3")  # endpoint_url -> Cloudflare R2
    s3.upload_file("video.mp4", BUCKET, "video/intro.mp4")

    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": "video/intro.mp4"},
        ExpiresIn=3600,
    )
    print("uploaded:", url)


if __name__ == "__main__":
    main()

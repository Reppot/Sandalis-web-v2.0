import asyncio
import logging
import signal


logger = logging.getLogger("sandalis.worker")


async def run_worker() -> None:
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    def request_stop() -> None:
        stop_event.set()

    for signal_name in ("SIGINT", "SIGTERM"):
        signal_value = getattr(signal, signal_name, None)

        if signal_value is None:
            continue

        try:
            loop.add_signal_handler(
                signal_value,
                request_stop,
            )
        except (NotImplementedError, RuntimeError):
            signal.signal(
                signal_value,
                lambda _signum, _frame: request_stop(),
            )

    logger.info("Sandalis worker started")

    while not stop_event.is_set():
        try:
            await asyncio.wait_for(
                stop_event.wait(),
                timeout=60,
            )
        except TimeoutError:
            continue

    logger.info("Sandalis worker stopped")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(run_worker())


if __name__ == "__main__":
    main()
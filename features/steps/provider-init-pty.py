import os, pty, select, sys, time, signal
# A real terminal is required for the chooser. Input is sent only after its route
# labels have been observed, never after a timer guesses the prompt is ready.
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], sys.argv[1:4])
end = time.monotonic() + 45
seen = b''
sent = False
try:
    while time.monotonic() < end:
        ready, _, _ = select.select([fd], [], [], 0.1)
        if ready:
            try:
                data = os.read(fd, 65536)
            except OSError:
                break
            if not data:
                break
            os.write(1, data)
            seen += data
            if not sent and b'chatgpt' in seen.lower() and b'claude-code' in seen.lower():
                os.write(fd, (sys.argv[4] + '\n').encode())
                sent = True
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            sys.exit(os.waitstatus_to_exitcode(status))
    else:
        os.kill(pid, signal.SIGKILL)
        os.waitpid(pid, 0)
        raise RuntimeError('init terminal exceeded 45 seconds')
    _, status = os.waitpid(pid, 0)
    sys.exit(os.waitstatus_to_exitcode(status))
finally:
    os.close(fd)

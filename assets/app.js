const btn = document.getElementById("btn");
const status = document.getElementById("status");

if (btn && status) {
  btn.addEventListener("click", () => {
    status.textContent = `정상 동작: ${new Date().toLocaleString("ko-KR")}`;
  });
}

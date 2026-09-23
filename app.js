/* --- GERENCIAMENTO DE ESTADO E STORAGE --- */
const STORAGE_KEY = "irm_chamadas_v1";
const USERS_KEY = "irm_usuarios_v1";
const DISCIPLINA_KEY = "irm_disciplinas_v1";
const SESSION_KEY = "irm_sessao_v1";
const TIMESTAMP_KEY = "irm_timestamp_v1"; 

const SESSION_TIMEOUT = 2 * 60 * 1000; 
const INACTIVITY_WARNING_TIME = 2 * 60 * 1000; 

let inactivityTimer = null;
let classes = ["Turma I", "Turma II", "Turma III", "Turma IV", "Turma V", "Turma VI", "Turma VII", "Turma VIII"];

let calls = [];
let users = [];
let disciplinas = [];
let currentUser = null;
let datePickerInstance = null;

try {
  calls = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  users = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  disciplinas = JSON.parse(localStorage.getItem(DISCIPLINA_KEY)) || [
    { id: crypto.randomUUID(), nome: "Introdução a Teologia Cristã", obs: "Geral" },
    { id: crypto.randomUUID(), nome: "Teologia do AT e NT", obs: "Bíblica" }
  ];
  currentUser = JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
} catch (e) {
  console.error("Erro ao carregar dados do LocalStorage", e);
}

let currentCallId = null;
let editingUserId = null;

const $ = id => document.getElementById(id);
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(calls));
const saveUsers = () => localStorage.setItem(USERS_KEY, JSON.stringify(users));
const saveDisciplinas = () => localStorage.setItem(DISCIPLINA_KEY, JSON.stringify(disciplinas));
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));

function showLoading(show = true) {
  const loader = $("loadingOverlay");
  if (loader) {
    if (show) loader.classList.remove("hidden");
    else loader.classList.add("hidden");
  }
}

function showConfirm(title, message) {
  return new Promise((resolve) => {
    const modal = $("customConfirmModal");
    if (!modal) {
      resolve(window.confirm(message));
      return;
    }
    $("confirmModalTitle").textContent = title;
    $("confirmModalMessage").textContent = message;
    modal.classList.remove("hidden");

    const btnYes = $("btnConfirmYes");
    const btnNo = $("btnConfirmNo");

    const cleanup = () => {
      modal.classList.add("hidden");
      btnYes.onclick = null;
      btnNo.onclick = null;
    };

    btnYes.onclick = () => {
      cleanup();
      resolve(true);
    };

    btnNo.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

const formatLoginName = (fullName) => {
  if (!fullName) return "";
  const parts = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .split(/\s+/);

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  const primeiroNome = parts[0];
  const ultimoSobrenome = parts[parts.length - 1];

  return `${primeiroNome}.${ultimoSobrenome}`;
};

function showToast(msg) {
  const toast = $("toastNotification");
  if (!toast) {
    alert(msg);
    return;
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function view(name) {
  ["inicioView", "chamadasView", "detalhesChamadaView", "usuariosView", "dashboardAlunosView"].forEach(x => {
    if ($(x)) $(x).classList.add("hidden");
  });
  if ($(name)) $(name).classList.remove("hidden");
}

function checkAuth() {
  if (!currentUser) {
    if ($("loginView")) $("loginView").classList.remove("hidden");
    if ($("loginContainer")) $("loginContainer").classList.remove("hidden");
    if ($("appLayout")) $("appLayout").classList.add("hidden");
    stopInactivityTimer();
    return false;
  }

  const lastActivity = localStorage.getItem(TIMESTAMP_KEY);
  const now = Date.now();

  if (lastActivity && (now - parseInt(lastActivity, 10) > SESSION_TIMEOUT)) {
    logoutUser("Sua sessão expirou por inatividade. Faça login novamente.");
    return false;
  }

  localStorage.setItem(TIMESTAMP_KEY, now.toString());
  
  const validUsers = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  const userExists = validUsers.some(u => u.id === currentUser.id);

  if (!userExists) {
    logoutUser("Sua conta foi removida ou alterada. Faça login novamente.");
    return false;
  }

  if ($("loginView")) $("loginView").classList.add("hidden");
  if ($("loginContainer")) $("loginContainer").classList.add("hidden");
  if ($("appLayout")) $("appLayout").classList.remove("hidden");
  
  document.querySelectorAll(".admin-only").forEach(el => {
    if (currentUser.role === "admin") el.classList.remove("hidden");
    else el.classList.add("hidden");
  });

  if ($("sidebarUserName")) $("sidebarUserName").textContent = currentUser.name;
  if ($("sidebarUserRole")) $("sidebarUserRole").textContent = currentUser.role === "admin" ? "ADM · Instituto RLGM" : "Professor · Instituto RLGM";
  
  if (currentUser.forceReset) {
    openForceResetModal();
  }

  resetInactivityTimer();
  return true;
}

function logoutUser(msg = "Sessão encerrada.") {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TIMESTAMP_KEY);
  stopInactivityTimer();
  removeInactivityModal();
  if (msg) showToast(msg);
  checkAuth();
}

function resetInactivityTimer() {
  if (!currentUser) return;
  stopInactivityTimer();
  
  inactivityTimer = setTimeout(() => {
    showInactivityModal();
  }, INACTIVITY_WARNING_TIME);
}

function stopInactivityTimer() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

function showInactivityModal() {
  if (!currentUser) return;
  if ($("inactivityModalOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "inactivityModalOverlay";
  overlay.className = "inactivity-overlay";
  overlay.innerHTML = `
    <div class="inactivity-box">
      <h3>Ainda está a utilizar?</h3>
      <p>Passaram-se 2 minutos sem interação. Deseja continuar a utilizar o sistema?</p>
      <div class="inactivity-actions">
        <button id="btnInactivityYes" class="btn-inactivity-yes">Sim</button>
        <button id="btnInactivityNo" class="btn-inactivity-no">Não</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  $("btnInactivityYes").onclick = () => {
    removeInactivityModal();
    localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
    resetInactivityTimer();
    showToast("Sessão prolongada com sucesso!");
  };

  $("btnInactivityNo").onclick = () => {
    removeInactivityModal();
    logoutUser("Você optou por sair. Faça login novamente.");
  };
}

function removeInactivityModal() {
  const overlay = $("inactivityModalOverlay");
  if (overlay) overlay.remove();
}

function handleUserActivity() {
  if (currentUser && !$("inactivityModalOverlay")) {
    localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
    resetInactivityTimer();
  }
}

document.addEventListener("mousemove", handleUserActivity);
document.addEventListener("keypress", handleUserActivity);
document.addEventListener("click", handleUserActivity);
document.addEventListener("scroll", handleUserActivity);

function parseDates(daysStr) {
  if (!daysStr) return ["Data Geral"];
  return daysStr.split(",").map(d => d.trim()).filter(Boolean);
}

document.addEventListener("DOMContentLoaded", async () => {

  setupRealTimeValidation("userForm");
  setupRealTimeValidation("disciplinaForm");
  setupRealTimeValidation("callForm");
  setupRealTimeValidation("loginForm");
  setupRealTimeValidation("forceResetForm");

  // Ação do botão de Exportar Backup (JSON)[cite: 8]
  const btnExportBackup = $("btnExportBackup");
  if (btnExportBackup) {
    btnExportBackup.addEventListener("click", () => {
      exportarBackupJSON();
    });
  }

  // Ação do botão/input de Importar Backup (JSON)
  const btnImportBackup = $("btnImportBackup");
  const inputImportBackupFile = $("inputImportBackupFile");
  if (btnImportBackup && inputImportBackupFile) {
    btnImportBackup.addEventListener("click", () => {
      inputImportBackupFile.click();
    });

    inputImportBackupFile.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        importarBackupJSON(file);
      }
      // Limpa o input para permitir carregar o mesmo arquivo novamente se necessário
      e.target.value = "";
    });
  }

  const searchDisciplinaInput = $("searchDisciplinaInput");
  if (searchDisciplinaInput) {
    searchDisciplinaInput.addEventListener("input", () => renderDisciplinas());
  }

  if (!users || users.length === 0) {
    const adminPassHash = await hashPassword("admin123");
    users = [
      { id: "admin-root", name: "Administrador", email: "admin@irm.com", pass: adminPassHash, role: "admin", forceReset: false }
    ];
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  if ($("modalDataInput") && typeof flatpickr !== "undefined") {
    datePickerInstance = flatpickr("#modalDataInput", {
      mode: "multiple",
      dateFormat: "d/m/Y",
      conjunction: ", ",
      locale: flatpickr.l10ns.pt ? flatpickr.l10ns.pt : "default"
    });
  }

  const btnExportMenu = $("btnExportMenu");
  const exportMenuBox = $("exportMenuBox");
  
  if (btnExportMenu && exportMenuBox) {
    btnExportMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      exportMenuBox.classList.toggle("hidden");
    });

    document.addEventListener("click", () => {
      if (!exportMenuBox.classList.contains("hidden")) {
        exportMenuBox.classList.add("hidden");
      }
    });
  }

  const btnExportDashMenu = $("btnExportDashMenu");
  const exportDashMenuBox = $("exportDashMenuBox");

  if (btnExportDashMenu && exportDashMenuBox) {
    btnExportDashMenu.addEventListener("click", (e) => {
      e.stopPropagation();
      exportDashMenuBox.classList.toggle("hidden");
    });

    document.addEventListener("click", () => {
      if (!exportDashMenuBox.classList.contains("hidden")) {
        exportDashMenuBox.classList.add("hidden");
      }
    });
  }

  const optDashExcel = $("optDashExcel");
  if (optDashExcel) {
    optDashExcel.addEventListener("click", async () => {
      showLoading(true);
      setTimeout(() => {
        let allRecords = [];
        calls.forEach(c => {
          const dates = parseDates(c.days);
          c.students.forEach(s => {
            const studentAttendance = (c.attendance && c.attendance[s.id]) || {};
            const studentJustifications = (c.justifications && c.justifications[s.id]) || {};
            
            let totalAbsences = 0;
            let justificativosInfo = [];

            dates.forEach(day => {
              const status = typeof studentAttendance === "string" ? studentAttendance : (studentAttendance[day] || "Presente");
              if (status === "Falta") totalAbsences++;
              if (status === "Justificado") {
                const motivo = studentJustifications[day] ? `(${studentJustifications[day]})` : "";
                justificativosInfo.push(`${day}: Justificado ${motivo}`);
              }
            });

            const gradeVal = (c.grades && c.grades[s.id] !== undefined) ? c.grades[s.id] : "";
            const statusInfo = getFinalStatus(totalAbsences, gradeVal);

            allRecords.push({
              studentName: s.name,
              className: c.className,
              subject: c.subject,
              absences: totalAbsences,
              justificationsText: justificativosInfo.join(" | "),
              grade: gradeVal !== "" ? gradeVal : "N/A",
              status: statusInfo.text
            });
          });
        });

        const wsData = [["#", "Nome do Aluno", "Turma", "Disciplina", "Faltas", "Justificativas / Ocorrências", "Nota Final", "Status"]];
        allRecords.forEach((r, idx) => {
          wsData.push([idx + 1, r.studentName, r.className, r.subject, r.absences, r.justificationsText || "Nenhuma", r.grade, r.status]);
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Dashboard Alunos");
        XLSX.writeFile(wb, "dashboard_historico_alunos.xlsx");
        exportDashMenuBox.classList.add("hidden");
        showLoading(false);
        showToast("Relatório do Dashboard exportado para Excel!");
      }, 300);
    });
  }

  const optDashPDF = $("optDashPDF");
  if (optDashPDF) {
    optDashPDF.addEventListener("click", () => {
      showLoading(true);
      setTimeout(() => {
        let allRecords = [];
        calls.forEach(c => {
          const dates = parseDates(c.days);
          c.students.forEach(s => {
            const studentAttendance = (c.attendance && c.attendance[s.id]) || {};
            const studentJustifications = (c.justifications && c.justifications[s.id]) || {};
            
            let totalAbsences = 0;
            let justificativosInfo = [];

            dates.forEach(day => {
              const status = typeof studentAttendance === "string" ? studentAttendance : (studentAttendance[day] || "Presente");
              if (status === "Falta") totalAbsences++;
              if (status === "Justificado") {
                const motivo = studentJustifications[day] ? `(${studentJustifications[day]})` : "";
                justificativosInfo.push(`${day}: Justificado ${motivo}`);
              }
            });

            const gradeVal = (c.grades && c.grades[s.id] !== undefined) ? c.grades[s.id] : "";
            const statusInfo = getFinalStatus(totalAbsences, gradeVal);

            allRecords.push([
              s.name,
              c.className,
              c.subject,
              totalAbsences,
              justificativosInfo.join(", ") || "Nenhuma",
              gradeVal !== "" ? gradeVal : "N/A",
              statusInfo.text
            ]);
          });
        });

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.text("Instituto RLGM - Histórico e Desempenho dos Alunos", 14, 15);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 22);

        doc.autoTable({
          head: [["Nome do Aluno", "Turma", "Disciplina", "Faltas", "Justificativas / Ocorrências", "Nota Final", "Status"]],
          body: allRecords,
          startY: 28,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 3 }
        });

        doc.save("dashboard_historico_alunos.pdf");
        exportDashMenuBox.classList.add("hidden");
        showLoading(false);
        showToast("Relatório do Dashboard exportado para PDF!");
      }, 300);
    });
  }

  const optExcel = $("optExcel");
  if (optExcel) {
    optExcel.addEventListener("click", () => {
      showLoading(true);
      setTimeout(() => {
        let list = calls;
        const filterVal = $("filterClassSelect") ? $("filterClassSelect").value : "all";
        if (filterVal !== "all") {
          list = list.filter(x => x.className === filterVal);
        }
        if (currentUser && currentUser.role !== "admin") {
          list = list.filter(x => x.createdBy === currentUser.id);
        }

        if (!list || list.length === 0) {
          showLoading(false);
          showToast("Não existem dados de chamadas para exportar.");
          return;
        }

        const wsData = [["Disciplina", "Turma", "Professor", "Aluno", "Dias / Frequência", "Justificativas", "Nota Final", "Status Final"]];
        
        list.forEach(c => {
          const dates = parseDates(c.days);
          c.students.forEach(s => {
            const studentAttendance = (c.attendance && c.attendance[s.id]) || {};
            const studentJustifications = (c.justifications && c.justifications[s.id]) || {};
            
            let freqResumo = dates.map(day => {
              const p = typeof studentAttendance === "string" ? studentAttendance : (studentAttendance[day] || "Presente");
              return `${day}: ${p}`;
            }).join(" | ");

            let justificativosResumo = dates.map(day => {
              const p = typeof studentAttendance === "string" ? studentAttendance : (studentAttendance[day] || "Presente");
              if (p === "Justificado" && studentJustifications[day]) {
                return `${day}: ${studentJustifications[day]}`;
              }
              return null;
            }).filter(Boolean).join(" | ");

            let totalAbsences = 0;
            if (typeof studentAttendance === "string") {
              if (studentAttendance === "Falta") totalAbsences = 1;
            } else if (typeof studentAttendance === "object") {
              dates.forEach(day => {
                if (studentAttendance[day] === "Falta") totalAbsences++;
              });
            }

            const gradeVal = (c.grades && c.grades[s.id] !== undefined) ? c.grades[s.id] : "";
            const statusInfo = getFinalStatus(totalAbsences, gradeVal);

            wsData.push([
              c.subject,
              c.className,
              c.teacher,
              s.name,
              freqResumo,
              justificativosResumo || "Nenhuma",
              gradeVal !== "" ? gradeVal : "N/A",
              statusInfo.text
            ]);
          });
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, "Relatório Detalhado");
        XLSX.writeFile(wb, "relatorio_chamadas_detalhado.xlsx");
        
        exportMenuBox.classList.add("hidden");
        showLoading(false);
        showToast("Ficheiro Excel detalhado gerado com sucesso!");
      }, 300);
    });
  }

  const optPDF = $("optPDF");
  if (optPDF) {
    optPDF.addEventListener("click", () => {
      showLoading(true);
      setTimeout(() => {
        let list = calls;
        const filterVal = $("filterClassSelect") ? $("filterClassSelect").value : "all";
        if (filterVal !== "all") {
          list = list.filter(x => x.className === filterVal);
        }
        if (currentUser && currentUser.role !== "admin") {
          list = list.filter(x => x.createdBy === currentUser.id);
        }

        if (!list || list.length === 0) {
          showLoading(false);
          showToast("Não existem dados de chamadas para exportar.");
          return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape');

        doc.text("Instituto RLGM - Relatório Detalhado de Chamadas", 14, 15);
        doc.setFontSize(10);
        doc.text(`Gerado em: ${new Date().toLocaleDateString()}`, 14, 22);

        const rows = [];
        list.forEach(c => {
          const dates = parseDates(c.days);
          c.students.forEach(s => {
            const studentAttendance = (c.attendance && c.attendance[s.id]) || {};
            const studentJustifications = (c.justifications && c.justifications[s.id]) || {};
            
            let freqResumo = dates.map(day => {
              const p = typeof studentAttendance === "string" ? studentAttendance : (studentAttendance[day] || "Presente");
              return `${day}: ${p}`;
            }).join(", ");

            let justificativosResumo = dates.map(day => {
              const p = typeof studentAttendance === "string" ? studentAttendance : (studentAttendance[day] || "Presente");
              if (p === "Justificado" && studentJustifications[day]) {
                return `${day}: ${studentJustifications[day]}`;
              }
              return null;
            }).filter(Boolean).join(", ");

            let totalAbsences = 0;
            if (typeof studentAttendance === "string") {
              if (studentAttendance === "Falta") totalAbsences = 1;
            } else if (typeof studentAttendance === "object") {
              dates.forEach(day => {
                if (studentAttendance[day] === "Falta") totalAbsences++;
              });
            }

            const gradeVal = (c.grades && c.grades[s.id] !== undefined) ? c.grades[s.id] : "";
            const statusInfo = getFinalStatus(totalAbsences, gradeVal);

            rows.push([
              c.subject,
              c.className,
              s.name,
              freqResumo,
              justificativosResumo || "Nenhuma",
              gradeVal !== "" ? gradeVal : "N/A",
              statusInfo.text
            ]);
          });
        });

        doc.autoTable({
          head: [["Disciplina", "Turma", "Aluno", "Frequência por Dia", "Justificativas", "Nota", "Status Final"]],
          body: rows,
          startY: 28,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 3 }
        });

        doc.save("relatorio_chamadas_detalhado.pdf");
        exportMenuBox.classList.add("hidden");
        showLoading(false);
        showToast("Ficheiro PDF detalhado gerado com sucesso!");
      }, 300);
    });
  }

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.onclick = () => {
      const parentView = btn.closest('.view-section');
      if (!parentView) return;

      parentView.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      parentView.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));

      btn.classList.add("active");
      const targetId = btn.dataset.tab;
      if ($(targetId))$(targetId).classList.remove("hidden");
    };
  });

  const loginForm = $("loginForm");
  if (loginForm) {
    loginForm.onsubmit = async e => {
      e.preventDefault();
      const loginInput = $("loginEmail")?.value.trim().toLowerCase();
      const pass = $("loginPassword")?.value.trim();

      if (!loginInput || !pass) {
        showToast("Preencha o login e a senha.");
        return;
      }

      showLoading(true);
      setTimeout(async () => {
        const foundUser = users.find(u => formatLoginName(u.name).toLowerCase() === loginInput);

        if (!foundUser) {
          showLoading(false);
          showToast("Utilizador não encontrado. Verifique o login.");
          return;
        }

        const hashedInputPass = await hashPassword(pass);

        if (foundUser.pass !== hashedInputPass) {
          showLoading(false);
          showToast("Senha incorreta. Tente novamente.");
          return;
        }

        currentUser = foundUser;
        localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
        localStorage.setItem(TIMESTAMP_KEY, Date.now().toString());
        
        showLoading(false);
        showToast(`Bem-vindo(a), ${foundUser.name}!`);
        
        if (checkAuth()) {
          view("inicioView");
          renderAll();
        }
      }, 300);
    };
  }

  const forceResetForm = $("forceResetForm");
  if (forceResetForm) {
    forceResetForm.onsubmit = async e => {
      e.preventDefault();
      const newPass = $("newPassword")?.value;
      const confirmPass = $("confirmPassword")?.value;

      if (newPass !== confirmPass) {
        showToast("As senhas não coincidem.");
        return;
      }

      if (!newPass || newPass.length < 6) {
        showToast("A senha deve ter pelo menos 6 caracteres.");
        return;
      }

      const hashedNewPass = await hashPassword(newPass);

      currentUser.pass = hashedNewPass;
      currentUser.forceReset = false;

      const idx = users.findIndex(u => u.id === currentUser.id);
      if (idx !== -1) {
        users[idx].pass = hashedNewPass;
        users[idx].forceReset = false;
        saveUsers();
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
      closeForceResetModal();
      showToast("Senha alterada com sucesso!");
    };
  }

  if ($("logoutBtn")) {
    $("logoutBtn").onclick = () => {
      logoutUser("Sessão terminada com sucesso.");
    };
  }

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-btn").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      
      const targetView = btn.dataset.view;
      if (targetView === "inicio") {
        view("inicioView");
        renderAll();
      } else if (targetView === "chamadas") {
        if ($("filterClassSelect")) $("filterClassSelect").value = "all";
        if ($("searchCallInput")) $("searchCallInput").value = "";
        renderAllCallsList();
        view("chamadasView");
      } else if (targetView === "dashboardAlunos") {
        renderDashboardAlunos();
        view("dashboardAlunosView");
      } else if (targetView === "usuarios") {
        if ($("searchUserInput")) $("searchUserInput").value = "";
        if ($("filterRoleSelect")) $("filterRoleSelect").value = "all";
        renderUsers();
        renderDisciplinas();
        view("usuariosView");
      }
    };
  });

  if ($("btnNewCallHeader")) $("btnNewCallHeader").onclick = openModal;
  if ($("btnNewCallCallsView")) $("btnNewCallCallsView").onclick = openModal;
  if ($("btnCancelCallModal")) $("btnCancelCallModal").onclick = closeModal;
  if ($("btnCloseCallModal")) $("btnCloseCallModal").onclick = closeModal;
  if ($("btnAddStudentRow")) $("btnAddStudentRow").onclick = () => addStudentRow();

  if ($("callForm")) {
    $("callForm").onsubmit = e => {
      e.preventDefault();
      const students = [...$("studentInputsList").querySelectorAll("input")].map(x => x.value.trim()).filter(Boolean);
      if (!students.length) {
        showToast("Adicione pelo menos um aluno.");
        return;
      }

      const selectedDates = $("modalDataInput").value;

      const c = {
        id: crypto.randomUUID(),
        className: $("modalTurmaSelect").value,
        teacher: currentUser ? currentUser.name : "Professor",
        subject: $("modalMateriaInput").value.trim(),
        days: selectedDates,
        students: students.map(name => ({ id: crypto.randomUUID(), name })),
        attendance: {},
        justifications: {},
        grades: {},
        status: "Em andamento",
        createdBy: currentUser ? currentUser.id : "sys",
        createdAt: Date.now()
      };

      calls.push(c);
      save();
      closeModal();
      renderAll();
      showToast("Chamada criada com sucesso!");
      openAttendance(c.id);
    };
  }

  if ($("btnNewUser")) $("btnNewUser").onclick = () => openUserModal();
  if ($("btnCancelUserModal")) $("btnCancelUserModal").onclick = closeUserModal;
  if ($("btnCloseUserModal")) $("btnCloseUserModal").onclick = closeUserModal;

  if ($("userForm")) {
    $("userForm").onsubmit = async e => {
      e.preventDefault();
      
      if (currentUser && currentUser.role !== "admin") {
        showToast("Apenas administradores podem salvar usuários.");
        return;
      }

      const name = $("modalUserName").value.trim();
      const email = $("modalUserEmail").value.trim();
      const pass = $("modalUserPassword") ? $("modalUserPassword").value.trim() : "";
      const roleSelect = $("modalUserRole") ? $("modalUserRole").value : "Professor";
      const role = (roleSelect === "Administrador" || roleSelect === "admin") ? "admin" : "professor";
      const forceReset = $("modalUserForceReset") ? $("modalUserForceReset").checked : false;

      if (!name || !email) {
        showToast("Preencha o nome e o e-mail.");
        return;
      }

      if (editingUserId) {
        const userIndex = users.findIndex(u => u.id === editingUserId);
        if (userIndex !== -1) {
          if (users.some(u => u.email === email && u.id !== editingUserId)) {
            showToast("E-mail já cadastrado por outro usuário.");
            return;
          }
          users[userIndex].name = name;
          users[userIndex].email = email;
          if (pass) {
            users[userIndex].pass = await hashPassword(pass);
          }
          users[userIndex].role = role;
          users[userIndex].forceReset = forceReset;
          showToast("Usuário atualizado!");
        }
      } else {
        if (users.some(u => u.email === email)) {
          showToast("E-mail já cadastrado.");
          return;
        }
        const defaultPass = pass ? pass : "123456";
        const hashedPass = await hashPassword(defaultPass);

        users.push({ 
          id: crypto.randomUUID(), 
          name, 
          email, 
          pass: hashedPass, 
          role, 
          forceReset 
        });
        showToast("Usuário criado com sucesso!");
      }

      saveUsers();
      renderUsers();
      closeUserModal();
    };
  }

  if ($("btnNewDisciplina")) $("btnNewDisciplina").onclick = openDisciplinaModal;
  if ($("btnCancelDisciplinaModal")) $("btnCancelDisciplinaModal").onclick = closeDisciplinaModal;
  if ($("btnCloseDisciplinaModal")) $("btnCloseDisciplinaModal").onclick = closeDisciplinaModal;

  if ($("disciplinaForm")) {
    $("disciplinaForm").onsubmit = e => {
      e.preventDefault();
      const nome = $("modalDisciplinaNome").value.trim();

      if (!nome) {
        showToast("Preencha o nome da disciplina.");
        return;
      }

      disciplinas.push({ id: crypto.randomUUID(), nome });
      saveDisciplinas();
      renderDisciplinas();
      closeDisciplinaModal();
      showToast("Disciplina cadastrada com sucesso!");
    };
  }

  if ($("filterClassSelect")) {
    $("filterClassSelect").onchange = () => renderAllCallsList();
  }

  const searchCallInput = $("searchCallInput");
  if (searchCallInput) {
    searchCallInput.oninput = () => renderAllCallsList();
  }

  const searchUserInput = $("searchUserInput");
  if (searchUserInput) {
    searchUserInput.oninput = () => renderUsers();
  }

  const filterRoleSelect = $("filterRoleSelect");
  if (filterRoleSelect) {
    filterRoleSelect.onchange = () => renderUsers();
  }

  if ($("btnSaveCallDetails")) {
    $("btnSaveCallDetails").onclick = () => {
      const c = calls.find(x => x.id === currentCallId);
      if (!c) return;

      const isFinished = c.status === "Finalizado";
      const isAdmin = currentUser && currentUser.role === "admin";
      if (isFinished && !isAdmin) {
        showToast("Chamadas finalizadas só podem ser alteradas por Administradores.");
        return;
      }

      if (!c.attendance) c.attendance = {};
      if (!c.justifications) c.justifications = {};
      if (!c.grades) c.grades = {};

      document.querySelectorAll(".status-select").forEach(select => {
        const studentId = select.dataset.student;
        const day = select.dataset.day;
        if (studentId && day) {
          if (!c.attendance[studentId] || typeof c.attendance[studentId] !== "object") {
            c.attendance[studentId] = {};
          }
          c.attendance[studentId][day] = select.value;
        }
      });

      document.querySelectorAll(".justification-input").forEach(input => {
        const studentId = input.dataset.student;
        const day = input.dataset.day;
        if (studentId && day) {
          if (!c.justifications[studentId]) c.justifications[studentId] = {};
          c.justifications[studentId][day] = input.value.trim();
        }
      });

      document.querySelectorAll(".grade-input").forEach(input => {
        if (input.dataset.student) {
          const v = input.value.trim();
          if (v !== "") {
            const num = parseFloat(v);
            if (Number.isFinite(num)) c.grades[input.dataset.student] = Math.max(0, Math.min(10, num));
          } else {
            delete c.grades[input.dataset.student];
          }
        }
      });

      save();
      renderAttendanceTable(c);
      renderGradesTable(c);
      showToast("Alterações salvas com sucesso!");
    };
  }

  if ($("btnFinishCall")) {
    $("btnFinishCall").onclick = async () => {
      if (currentCallId) {
        const confirmed = await showConfirm("Finalizar Chamada", "Deseja finalizar esta chamada? Após finalizada, as presenças ficarão bloqueadas.");
        if (confirmed) finishCall(currentCallId);
      }
    };
  }

  if ($("btnBackToCalls")) {
    $("btnBackToCalls").onclick = () => {
      view("chamadasView");
      renderAllCallsList();
    };
  }

  const toggleUserPassBtn = $("toggleUserPassword");
  const userPassInput = $("modalUserPassword");

  if (toggleUserPassBtn && userPassInput) {
    toggleUserPassBtn.onclick = () => {
      const isPassword = userPassInput.type === "password";
      userPassInput.type = isPassword ? "text" : "password";
      toggleUserPassBtn.textContent = isPassword ? "🙈" : "👁️";
    };
  }

  const btnOpenChangePassword = $("btnOpenChangePassword");
  if (btnOpenChangePassword) {
    btnOpenChangePassword.onclick = () => {
      openForceResetModal();
    };
  }

  const toggleNewPasswordBtn = $("toggleNewPassword");
  const newPasswordInput = $("newPassword");

  if (toggleNewPasswordBtn && newPasswordInput) {
    toggleNewPasswordBtn.onclick = () => {
      const isPassword = newPasswordInput.type === "password";
      newPasswordInput.type = isPassword ? "text" : "password";
      toggleNewPasswordBtn.textContent = isPassword ? "🙈" : "👁️";
    };
  }

  const toggleConfirmPasswordBtn = $("toggleConfirmPassword");
  const confirmPasswordInput = $("confirmPassword");

  if (toggleConfirmPasswordBtn && confirmPasswordInput) {
    toggleConfirmPasswordBtn.onclick = () => {
      const isPassword = confirmPasswordInput.type === "password";
      confirmPasswordInput.type = isPassword ? "text" : "password";
      toggleConfirmPasswordBtn.textContent = isPassword ? "🙈" : "👁️";
    };
  }

  if (checkAuth()) {
    renderAll();
  }
});

function renderAll() {
  renderClasses();
  renderRecent();
  populateClassFilterSelects();
}

function renderClasses() {
  const container = $("classGrid");
  if (!container) return;

  const currentYear = new Date().getFullYear();

  container.innerHTML = classes.map((c, index) => {
    const count = calls.filter(x => x.className === c).length;
    const classCode = `${currentYear}.${index + 1}`;

    return `<div class="class-card">
      <div class="class-number">${classCode}</div>
      <div class="class-label">${c}</div>
      <button class="btn-secondary" onclick="openClass('${c}')">${count} chamada${count === 1 ? "" : "s"}</button>
    </div>`;
  }).join("");
}

function renderRecent() {
  if (!$("recentCallsList")) return;
  let list = [...calls];
  
  if (currentUser && currentUser.role !== "admin") {
    list = list.filter(c => c.createdBy === currentUser.id);
  }

  const recent = list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  $("recentCallsList").innerHTML = recent.length ? recent.map(c => callCard(c, true)).join("") : `<div class="empty">Nenhuma chamada encontrada.</div>`;
}

function callCard(c, isHome = false) {
  const canEdit = currentUser && (currentUser.role === "admin" || c.createdBy === currentUser.id);
  const currentStatus = c.status || "Em andamento";
  const isFinished = currentStatus === "Finalizado";

  const actionsHtml = isHome ? '' : `
    <div class="call-actions">
      <button class="btn-secondary" onclick="openAttendance('${c.id}')">Abrir chamada</button>
      ${!isFinished && canEdit ? `<button class="btn-success" onclick="finishCall('${c.id}')">Finalizar</button>` : ''}
      ${canEdit ? `<button class="btn-danger" onclick="deleteCall('${c.id}')">Excluir</button>` : ''}
    </div>
  `;

  return `<div class="call-card ${isFinished ? 'is-finished' : ''}">
    <div class="call-info">
      <div>
        <h3>${esc(c.subject)} — ${esc(c.className)}</h3>
        <p>Professor: ${esc(c.teacher)} · Data(s): ${esc(c.days)} · ${c.students.length} aluno(s)</p>
      </div>
    </div>
    ${actionsHtml}
  </div>`;
}

function renderAllCallsList() {
  const container = $("callsListContainer");
  if (!container) return;
  let list = calls;
  
  const filterVal = $("filterClassSelect") ? $("filterClassSelect").value : "all";
  if (filterVal !== "all") {
    list = list.filter(x => x.className === filterVal);
  }

  const searchVal = $("searchCallInput") ? $("searchCallInput").value.trim().toLowerCase() : "";
  if (searchVal) {
    list = list.filter(x => {
      const matchSubject = x.subject.toLowerCase().includes(searchVal);
      const matchTeacher = x.teacher.toLowerCase().includes(searchVal);
      const matchStudent = x.students.some(s => s.name.toLowerCase().includes(searchVal));
      return matchSubject || matchTeacher || matchStudent;
    });
  }

  if (currentUser && currentUser.role !== "admin") {
    list = list.filter(x => x.createdBy === currentUser.id);
  }

  container.innerHTML = list.length ? list.map(c => callCard(c, false)).join("") : `<div class="empty">Nenhuma chamada encontrada.</div>`;
}

function openClass(c) {
  if ($("filterClassSelect")) $("filterClassSelect").value = c;
  renderAllCallsList();
  view("chamadasView");
}

function openAttendance(id) {
  currentCallId = id;
  const c = calls.find(x => x.id === id);
  if (!c) return;

  if ($("callDetailTitle")) $("callDetailTitle").textContent = `${c.subject} - ${c.className}`;
  if ($("callDetailSubtitle")) $("callDetailSubtitle").textContent = `Professor: ${c.teacher} | Data(s): ${c.days}`;

  const isFinished = c.status === "Finalizado";
  const isAdmin = currentUser && currentUser.role === "admin";
  const canEdit = !isFinished || isAdmin;

  if ($("btnSaveCallDetails")) {
    $("btnSaveCallDetails").disabled = !canEdit;
    $("btnSaveCallDetails").style.display = canEdit ? "inline-block" : "none";
  }

  if ($("btnFinishCall")) {
    $("btnFinishCall").disabled = isFinished;
    $("btnFinishCall").style.display = (!isFinished && canEdit) ? "inline-block" : "none";
  }

  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(tab => tab.classList.add("hidden"));
  
  const tabFreqBtn = document.querySelector('.tab-btn[data-tab="tabFrequencia"]');
  if (tabFreqBtn) tabFreqBtn.classList.add("active");
  if ($("tabFrequencia")) $("tabFrequencia").classList.remove("hidden");

  renderAttendanceTable(c);
  renderGradesTable(c);
  view("detalhesChamadaView");
}

function renderAttendanceTable(c) {
  const thead = $("attendanceThead");
  const tbody = $("attendanceTbody");
  if (!tbody || !thead) return;

  const dates = parseDates(c.days);
  const isFinished = c.status === "Finalizado";
  const isAdmin = currentUser && currentUser.role === "admin";
  const isDisabled = isFinished && !isAdmin ? "disabled" : "";

  thead.innerHTML = `<tr>
    <th class="col-width-50">#</th>
    <th>Nome do Aluno</th>
    ${dates.map(d => `<th class="text-center">${esc(d)}</th>`).join("")}
  </tr>`;

  tbody.innerHTML = c.students.map((s, index) => {
    const studentAttendance = (c.attendance && c.attendance[s.id]) || {};
    const studentJustifications = (c.justifications && c.justifications[s.id]) || {};

    const daysColsHtml = dates.map(day => {
      const presenceVal = typeof studentAttendance === "string" 
        ? studentAttendance 
        : (studentAttendance[day] || "Presente");
      
      const justifVal = studentJustifications[day] || "";
      const isJustified = presenceVal === "Justificado";
      
      const hasJustifSaved = isJustified && justifVal.trim().length > 0;
      
      const showContainerStyle = isJustified ? "display: flex; gap: 4px; align-items: center; margin-top: 5px;" : "display: none; margin-top: 5px;";
      const inputDisabledAttr = hasJustifSaved && !isAdmin && isFinished ? "disabled" : "";

      return `<td class="text-center">
        <select class="status-select" data-student="${s.id}" data-day="${esc(day)}" ${isDisabled} onchange="onAttendanceStatusChange(this, '${s.id}', '${esc(day)}')">
          <option value="Presente" ${presenceVal === "Presente" ? "selected" : ""}>Presente</option>
          <option value="Falta" ${presenceVal === "Falta" ? "selected" : ""}>Falta</option>
          <option value="Justificado" ${presenceVal === "Justificado" ? "selected" : ""}>Justificado</option>
        </select>
        
        <div class="justification-wrapper" data-student="${s.id}" data-day="${esc(day)}" style="${showContainerStyle}">
          <input type="text" class="justification-input" data-student="${s.id}" data-day="${esc(day)}" placeholder="Escreva o ocorrido..." value="${esc(justifVal)}" style="width: 100%; font-size: 11px; padding: 4px;" ${hasJustifSaved ? 'readonly' : ''} ${inputDisabledAttr}>
          
          ${hasJustifSaved ? `
            <button type="button" class="btn-edit-justif" onclick="enableEditJustification(this)">Editar</button>
          ` : `
            <button type="button" class="btn-confirm-justif" onclick="confirmJustification(this, '${s.id}', '${esc(day)}')" style="background-color: #3182ce; color: white; border: none; padding: 4px 8px; font-size: 10px; border-radius: 4px; cursor: pointer; white-space: nowrap;">Confirmar</button>
          `}
        </div>
      </td>`;
    }).join("");

    return `<tr>
      <td><b>${index + 1}</b></td>
      <td><b>${esc(s.name)}</b></td>
      ${daysColsHtml}
    </tr>`;
  }).join("");
}

window.onAttendanceStatusChange = function(selectEl, studentId, day) {
  const td = selectEl.closest("td");
  const wrapper = td.querySelector(".justification-wrapper");
  const input = wrapper.querySelector(".justification-input");
  
  if (selectEl.value === "Justificado") {
    wrapper.style.display = "flex";
    input.value = "";
    input.removeAttribute("readonly");
    
    let btn = wrapper.querySelector("button");
    if (btn) {
      btn.className = "btn-confirm-justif";
      btn.textContent = "Confirmar";
      btn.style.backgroundColor = "#3182ce";
      btn.setAttribute("onclick", `confirmJustification(this, '${studentId}', '${day}')`);
    }
  } else {
    wrapper.style.display = "none";
    input.value = "";
    
    const c = calls.find(x => x.id === currentCallId);
    if (c && c.justifications && c.justifications[studentId]) {
      delete c.justifications[studentId][day];
      save();
    }
  }
};

window.confirmJustification = function(btnEl, studentId, day) {
  const wrapper = btnEl.closest(".justification-wrapper");
  const input = wrapper.querySelector(".justification-input");
  const textVal = input.value.trim();

  if (!textVal) {
    showToast("Escreva a justificativa antes de confirmar.");
    input.focus();
    return;
  }

  const c = calls.find(x => x.id === currentCallId);
  if (!c) return;

  if (!c.justifications) c.justifications = {};
  if (!c.justifications[studentId]) c.justifications[studentId] = {};
  c.justifications[studentId][day] = textVal;
  save();

  input.setAttribute("readonly", "true");
  btnEl.className = "btn-edit-justif";
  btnEl.textContent = "Editar";
  btnEl.style.backgroundColor = "#4a5568";
  btnEl.setAttribute("onclick", "enableEditJustification(this)");

  showToast("Justificativa salva com sucesso!");
};

window.enableEditJustification = function(btnEl) {
  const wrapper = btnEl.closest(".justification-wrapper");
  const input = wrapper.querySelector(".justification-input");
  
  input.removeAttribute("readonly");
  input.focus();

  btnEl.className = "btn-confirm-justif";
  btnEl.textContent = "Confirmar";
  btnEl.style.backgroundColor = "#3182ce";
  
  const studentId = input.dataset.student;
  const day = input.dataset.day;
  btnEl.setAttribute("onclick", `confirmJustification(this, '${studentId}', '${day}')`);
};

function renderGradesTable(c) {
  const container = $("gradesTbody");
  if (!container) return;

  const dates = parseDates(c.days);
  const isFinished = c.status === "Finalizado";
  const isAdmin = currentUser && currentUser.role === "admin";
  const isDisabled = isFinished && !isAdmin ? "disabled" : "";

  container.innerHTML = c.students.map((s, index) => {
    const studentAttendance = (c.attendance && c.attendance[s.id]) || {};

    let totalAbsences = 0;
    if (typeof studentAttendance === "string") {
      if (studentAttendance === "Falta") totalAbsences = 1;
    } else if (typeof studentAttendance === "object") {
      dates.forEach(day => {
        if (studentAttendance[day] === "Falta") {
          totalAbsences++;
        }
      });
    }

    const gradeVal = (c.grades && c.grades[s.id] !== undefined) ? c.grades[s.id] : "";
    const statusInfo = getFinalStatus(totalAbsences, gradeVal);

    return `<tr>
      <td><b>${index + 1}</b></td>
      <td><b>${esc(s.name)}</b></td>
      <td>
        <input class="grade-input" type="number" min="0" max="10" step="0.1" value="${esc(gradeVal)}" data-student="${s.id}" placeholder="Ex: 8.5" ${isDisabled}>
      </td>
      <td>
        <span class="status-badge ${statusInfo.cssClass}">
          ${statusInfo.text}
        </span>
      </td>
    </tr>`;
  }).join("");
}

function getFinalStatus(absences, grade) {
  if (absences >= 3) {
    return { text: "Reprovado (Falta)", cssClass: "reprovado" };
  }

  const numGrade = parseFloat(grade);
  const hasValidGrade = Number.isFinite(numGrade);

  if (!hasValidGrade) {
    return { text: "Pendente", cssClass: "pendente" };
  }

  if (numGrade < 6) {
    return { text: "Reprovado (Nota)", cssClass: "reprovado" };
  }

  return { text: "Aprovado", cssClass: "aprovado" };
}

function finishCall(id) {
  const c = calls.find(x => x.id === id);
  if (!c) return;
  c.status = "Finalizado";
  save();
  renderAll();
  renderAllCallsList();
  openAttendance(id);
  showToast("Chamada finalizada!");
}

window.deleteCall = async function(id) {
  const confirmed = await showConfirm("Excluir Chamada", "Deseja realmente excluir esta chamada do sistema?");
  if (!confirmed) return;
  calls = calls.filter(x => x.id !== id);
  save();
  renderAll();
  renderAllCallsList();
  showToast("Chamada excluída.");
};

function populateClassFilterSelects() {
  const currentYear = new Date().getFullYear();

  const filterOptionsHtml = `<option value="all">Todas as Turmas</option>` + 
    classes.map((c, index) => {
      const code = `${c} - ${currentYear}.${index + 1}`;
      return `<option value="${c}">${code}</option>`;
    }).join("");

  if ($("filterClassSelect")) {
    $("filterClassSelect").innerHTML = filterOptionsHtml;
  }

  const modalOptionsHtml = classes.map((c, index) => {
    const code = `${c} - ${currentYear}.${index + 1}`;
    return `<option value="${c}">${code}</option>`;
  }).join("");

  if ($("modalTurmaSelect")) {
    $("modalTurmaSelect").innerHTML = modalOptionsHtml;
  }
}

function populateDisciplinasSelect() {
  const selectMateria = $("modalMateriaInput");
  if (!selectMateria) return;

  selectMateria.innerHTML = '<option value="" disabled selected>Selecione uma matéria</option>';
  disciplinas.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.nome;
    opt.textContent = d.nome;
    selectMateria.appendChild(opt);
  });
}

function renderDashboardAlunos() {
  const tbody = $("dashAlunosTbody");
  if (!tbody) return;

  let allRecords = [];

  calls.forEach(c => {
    const dates = parseDates(c.days);

    c.students.forEach(s => {
      const studentAttendance = (c.attendance && c.attendance[s.id]) || {};
      let totalAbsences = 0;

      if (typeof studentAttendance === "string") {
        if (studentAttendance === "Falta") totalAbsences = 1;
      } else if (typeof studentAttendance === "object") {
        dates.forEach(day => {
          if (studentAttendance[day] === "Falta") totalAbsences++;
        });
      }

      const gradeVal = (c.grades && c.grades[s.id] !== undefined) ? c.grades[s.id] : "";
      const statusInfo = getFinalStatus(totalAbsences, gradeVal);

      allRecords.push({
        studentName: s.name,
        className: c.className,
        subject: c.subject,
        absences: totalAbsences,
        grade: gradeVal !== "" ? parseFloat(gradeVal).toFixed(1) : "N/A",
        status: statusInfo
      });
    });
  });

  const total = allRecords.length;
  const aprovados = allRecords.filter(r => r.status.cssClass === "aprovado").length;
  const reprovados = allRecords.filter(r => r.status.cssClass === "reprovado").length;

  if ($("dashTotalAlunos")) $("dashTotalAlunos").textContent = total;
  if ($("dashTotalAprovados")) $("dashTotalAprovados").textContent = aprovados;
  if ($("dashTotalReprovados")) $("dashTotalReprovados").textContent = reprovados;

  tbody.innerHTML = allRecords.length ? allRecords.map((r, i) => `
    <tr>
      <td><b>${i + 1}</b></td>
      <td><b>${esc(r.studentName)}</b></td>
      <td>${esc(r.className)}</td>
      <td>${esc(r.subject)}</td>
      <td>${r.absences}</td>
      <td><b>${r.grade}</b></td>
      <td><span class="status-badge ${r.status.cssClass}">${r.status.text}</span></td>
    </tr>
  `).join("") : `<tr><td colspan="7" style="text-align: center;">Nenhum registo de aluno encontrado.</td></tr>`;
}

function openModal() {
  populateDisciplinasSelect();
  if ($("callModal")) $("callModal").classList.remove("hidden");
  if ($("callForm")) $("callForm").reset();
  if (datePickerInstance) datePickerInstance.clear();

  if ($("studentInputsList")) {
    $("studentInputsList").innerHTML = "";
    addStudentRow();
    addStudentRow();
  }
}

function closeModal() {
  if ($("callModal")) $("callModal").classList.add("hidden");
}

function addStudentRow(value = "") {
  const wrap = $("studentInputsList");
  if (!wrap) return;
  const n = wrap.children.length + 1;
  const row = document.createElement("div");
  row.className = "student-row";
  row.innerHTML = `
    <span>${n}</span>
    <input type="text" placeholder="Nome do aluno" value="${esc(value)}" required>
    <button type="button" class="remove-student" title="Remover aluno">&times;</button>
  `;
  
  row.querySelector(".remove-student").onclick = () => {
    row.remove();
    reindexStudentRows();
  };

  wrap.appendChild(row);
}

function reindexStudentRows() {
  const wrap = $("studentInputsList");
  if (!wrap) return;
  [...wrap.children].forEach((row, i) => {
    const span = row.querySelector("span");
    if (span) span.textContent = i + 1;
  });
}

function renderUsers() {
  if (!$("usersTbody")) return;

  let list = [...users];

  const searchVal = $("searchUserInput") ? $("searchUserInput").value.trim().toLowerCase() : "";
  if (searchVal) {
    list = list.filter(u => 
      u.name.toLowerCase().includes(searchVal) || 
      u.email.toLowerCase().includes(searchVal)
    );
  }

  const roleVal = $("filterRoleSelect") ? $("filterRoleSelect").value : "all";
  if (roleVal !== "all") {
    list = list.filter(u => u.role === roleVal);
  }

  $("usersTbody").innerHTML = list.length ? list.map(u => {
    const isSelf = currentUser && u.id === currentUser.id;
    const loginFormatado = formatLoginName(u.name);

    return `<tr>
      <td><b>${esc(u.name)}</b></td>
      <td>${esc(u.email)}</td>
      <td><code>${esc(loginFormatado)}</code></td>
      <td>${u.role === 'admin' ? 'ADM' : 'Professor'}</td>
      <td><span class="tag-force-reset ${u.forceReset ? 'active' : 'inactive'}">${u.forceReset ? 'Sim' : 'Não'}</span></td>
      <td>
        ${!isSelf ? `
          <div class="action-btn-group">
            <button class="btn-action-edit" onclick="editUser('${u.id}')">Editar</button>
            <button class="btn-action-delete" onclick="deleteUser('${u.id}')">Excluir</button>
          </div>
        ` : '<i>Sua conta</i>'}
      </td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" style="text-align: center;">Nenhum usuário encontrado.</td></tr>`;
}

function openUserModal(id = null) {
  editingUserId = id;
  if ($("userModal")) $("userModal").classList.remove("hidden");
  
  if (id) {
    const u = users.find(x => x.id === id);
    if (!u) return;
    if ($("modalUserTitle")) $("modalUserTitle").textContent = "Editar Usuário";
    if ($("modalUserName")) $("modalUserName").value = u.name;
    if ($("modalUserEmail")) $("modalUserEmail").value = u.email;
    if ($("modalUserPassword")) $("modalUserPassword").value = "";
    if ($("modalUserRole")) $("modalUserRole").value = u.role === "admin" ? "Administrador" : "Professor";
    if ($("modalUserForceReset")) $("modalUserForceReset").checked = !!u.forceReset;
  } else {
    if ($("modalUserTitle")) $("modalUserTitle").textContent = "Novo Usuário";
    if ($("userForm")) $("userForm").reset();

    if ($("modalUserName")) $("modalUserName").value = "";
    if ($("modalUserEmail")) $("modalUserEmail").value = "";
    if ($("modalUserPassword")) $("modalUserPassword").value = "";
    if ($("modalUserForceReset")) $("modalUserForceReset").checked = false;
  }
}

function closeUserModal() {
  if ($("userModal")) $("userModal").classList.add("hidden");
  editingUserId = null;
}

function openForceResetModal() {
  if ($("forceResetForm")) $("forceResetForm").reset();
  if ($("forceResetModal")) $("forceResetModal").classList.remove("hidden");
}

function closeForceResetModal() {
  if ($("forceResetModal")) $("forceResetModal").classList.add("hidden");
}

function renderDisciplinas() {
  const container = $("disciplinasTbody");
  if (!container) return;

  let list = [...disciplinas];

  if ($("totalDisciplinasCount")) {
    $("totalDisciplinasCount").textContent = disciplinas.length;
  }

  const searchVal = $("searchDisciplinaInput") ? $("searchDisciplinaInput").value.trim().toLowerCase() : "";
  if (searchVal) {
    list = list.filter(d => d.nome.toLowerCase().includes(searchVal));
  }

  container.innerHTML = list.length ? list.map(d => `
    <tr>
      <td><b>${esc(d.nome)}</b></td>
      <td class="text-align-right">
        <button class="btn-action-delete" onclick="deleteDisciplina('${d.id}')">Excluir</button>
      </td>
    </tr>
  `).join("") : `<tr><td colspan="2" style="text-align:center;">Nenhuma disciplina encontrada.</td></tr>`;
}

function openDisciplinaModal() {
  if ($("disciplinaModal")) $("disciplinaModal").classList.remove("hidden");
  if ($("disciplinaForm")) $("disciplinaForm").reset();
}

function closeDisciplinaModal() {
  if ($("disciplinaModal")) $("disciplinaModal").classList.add("hidden");
}

window.deleteDisciplina = async id => {
  const confirmed = await showConfirm("Excluir Disciplina", "Deseja remover esta disciplina?");
  if (!confirmed) return;
  disciplinas = disciplinas.filter(d => d.id !== id);
  saveDisciplinas();
  renderDisciplinas();
  showToast("Disciplina removida.");
};

window.editUser = id => openUserModal(id);
window.deleteUser = async id => {
  if (currentUser && currentUser.role !== "admin") return;
  const confirmed = await showConfirm("Excluir Usuário", "Deseja remover este usuário?");
  if (!confirmed) return;
  users = users.filter(u => u.id !== id);
  saveUsers();
  renderUsers();
  showToast("Usuário removido.");
};

function setupRealTimeValidation(formId) {
  const form = $(formId);
  if (!form) return;

  const inputs = form.querySelectorAll("input[required], select[required], textarea[required]");

  inputs.forEach(input => {
    input.addEventListener("input", () => validateField(input));
    input.addEventListener("blur", () => validateField(input));
  });
}

function validateField(input) {
  if (!input.value.trim() || (input.type === "email" && !input.value.includes("@"))) {
    input.style.borderColor = "#e74c3c"; 
    input.style.backgroundColor = "#fdf2f2";
  } else {
    input.style.borderColor = "#2ecc71"; 
    input.style.backgroundColor = "#f4fcf7";
  }
}

function exportarBackupJSON() {
  const dadosBackup = {
    versao: "1.0",
    dataExportacao: new Date().toISOString(),
    chamadas: typeof calls !== "undefined" ? calls : [],
    disciplinas: typeof disciplinas !== "undefined" ? disciplinas : [],
    usuarios: typeof users !== "undefined" ? users : []
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dadosBackup, null, 2));
  
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  
  const dataFormatada = new Date().toISOString().slice(0, 10);
  downloadAnchor.setAttribute("download", `backup_sistema_irm_${dataFormatada}.json`);
  
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  
  showToast("Backup do sistema exportado em JSON com sucesso!");
}

async function importarBackupJSON(file) {
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const conteudoJSON = JSON.parse(e.target.result);

      if (!conteudoJSON || typeof conteudoJSON !== "object") {
        throw new Error("Formato de ficheiro inválido.");
      }

      const confirmed = await showConfirm("Importar Backup", "Atenção: A importação irá substituir os dados atuais do sistema pelos dados do backup. Deseja continuar?");
      if (!confirmed) return;

      if (Array.isArray(conteudoJSON.chamadas)) {
        calls = conteudoJSON.chamadas;
        save();
      }
      if (Array.isArray(conteudoJSON.disciplinas)) {
        disciplinas = conteudoJSON.disciplinas;
        saveDisciplinas();
      }
      if (Array.isArray(conteudoJSON.usuarios)) {
        users = conteudoJSON.usuarios;
        saveUsers();
      }

      showToast("Backup importado com sucesso! Atualizando sistema...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (err) {
      console.error(err);
      showToast("Erro ao processar o ficheiro JSON de backup. Certifique-se de que é um ficheiro válido.");
    }

  };
  reader.readAsText(file);
}
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerLink = document.getElementById('registerLink');
    const messageDiv = document.getElementById('message');

    function showMessage(msg, type = 'error') {
        messageDiv.textContent = msg;
        messageDiv.className = `text-center mb-4 ${type === 'error' ? 'text-red-500' : 'text-green-500'}`;
        messageDiv.classList.remove('hidden');
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const response = await fetch('http://localhost:8080/api/login', { // Porta 8080
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    showMessage(data.message, 'success');
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1500);
                } else {
                    showMessage(data.message || 'Erro desconhecido ao fazer login.');
                }

            } catch (error) {
                console.error('Erro de rede ou servidor:', error);
                showMessage('Não foi possível conectar ao servidor. Tente novamente mais tarde.');
            }
        });
    }

    if (registerLink) {
        registerLink.addEventListener('click', async (e) => {
            e.preventDefault();

            const email = prompt('Digite seu e-mail para registro:');
            const password = prompt('Digite sua senha para registro:');

            if (!email || !password) {
                showMessage('E-mail e senha são obrigatórios para registro.');
                return;
            }

            try {
                const response = await fetch('http://localhost:8080/api/register', { // Porta 8080
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok) {
                    showMessage(data.message, 'success');
                    alert('Registro bem-sucedido! Agora você pode fazer login.');
                } else {
                    showMessage(data.message || 'Erro desconhecido ao registrar.');
                }

            } catch (error) {
                console.error('Erro de rede ou servidor no registro:', error);
                showMessage('Não foi possível conectar ao servidor para registro.');
            }
        });
    }
});
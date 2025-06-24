// Função para calcular distância entre dois pontos (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    function toRad(x) { return x * Math.PI / 180; }
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Função para obter coordenadas de um endereço usando Nominatim (OpenStreetMap)
async function obterCoordenadas(endereco) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data && data[0]) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
}

// Função para carregar endereços do LocalStorage
function carregarEnderecos() {
    return JSON.parse(localStorage.getItem('enderecos')) || [];
}

// Função para salvar endereços no LocalStorage
function salvarEnderecos(enderecos) {
    localStorage.setItem('enderecos', JSON.stringify(enderecos));
}

function renderizarEnderecos(localizacaoAtual) {
    const lista = document.getElementById('enderecos');
    lista.innerHTML = '';
    let enderecos = carregarEnderecos();
    if (localizacaoAtual) {
        enderecos = enderecos.map(e => {
            if (e.lat && e.lon) {
                e.dist = calcularDistancia(localizacaoAtual.lat, localizacaoAtual.lon, e.lat, e.lon);
            } else {
                e.dist = null;
            }
            return e;
        });
        enderecos.sort((a, b) => {
            if (a.dist === null) return 1;
            if (b.dist === null) return -1;
            return a.dist - b.dist;
        });
    }
    enderecos.forEach((e, idx) => {
        const li = document.createElement('li');
        li.textContent = e.endereco + (e.dist !== undefined && e.dist !== null ? ` (${e.dist.toFixed(2)} km)` : '');
        const btn = document.createElement('button');
        btn.textContent = 'Entregue';
        btn.style.marginLeft = '10px';
        btn.disabled = false;
        btn.onclick = () => {
            removerEndereco(idx, localizacaoAtual);
        };
        li.appendChild(btn);
        lista.appendChild(li);
    });
}

function removerEndereco(idx, localizacaoAtual) {
    let enderecos = carregarEnderecos();
    // Ordenar igual ao renderizarEnderecos para garantir o índice correto
    if (localizacaoAtual) {
        enderecos = enderecos.map(e => {
            if (e.lat && e.lon) {
                e.dist = calcularDistancia(localizacaoAtual.lat, localizacaoAtual.lon, e.lat, e.lon);
            } else {
                e.dist = null;
            }
            return e;
        });
        enderecos.sort((a, b) => {
            if (a.dist === null) return 1;
            if (b.dist === null) return -1;
            return a.dist - b.dist;
        });
    }
    enderecos.splice(idx, 1);
    salvarEnderecos(enderecos);
    atualizarTudo(localizacaoAtual);
}

let mapa = null;
let rotaLayer = null;

function desenharRotaNoMapa(localizacaoAtual, enderecos) {
    if (!mapa) {
        mapa = L.map('mapa').setView([-14, -51], 4); // Centro do Brasil
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(mapa);
    }
    if (rotaLayer) {
        mapa.removeLayer(rotaLayer);
    }
    // Limpa marcadores antigos
    mapa.eachLayer(function(layer) {
        if (layer instanceof L.Marker && !layer._url) {
            mapa.removeLayer(layer);
        }
    });
    const pontos = [];
    if (localizacaoAtual) {
        pontos.push([localizacaoAtual.lat, localizacaoAtual.lon]);
        L.marker([localizacaoAtual.lat, localizacaoAtual.lon]).addTo(mapa).bindPopup('Você').openPopup();
    }
    enderecos.forEach(e => {
        if (e.lat && e.lon) {
            pontos.push([e.lat, e.lon]);
            L.marker([e.lat, e.lon]).addTo(mapa).bindPopup(e.endereco);
        }
    });
    if (pontos.length > 1) {
        rotaLayer = L.polyline(pontos, {color: 'blue'}).addTo(mapa);
        mapa.fitBounds(rotaLayer.getBounds(), {padding: [30, 30]});
    } else if (pontos.length === 1) {
        mapa.setView(pontos[0], 13);
    }
}

function atualizarTudo(localizacaoAtual) {
    const enderecos = carregarEnderecos();
    renderizarEnderecos(localizacaoAtual);
    desenharRotaNoMapa(localizacaoAtual, enderecos);
}

// Atualizar funções para chamar atualizarTudo
function mostrarLocalizacaoAtual() {
    const status = document.getElementById('status-localizacao');
    if (!navigator.geolocation) {
        status.textContent = 'Geolocalização não suportada pelo navegador.';
        atualizarTudo();
        return;
    }
    status.textContent = 'Obtendo localização...';
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const { latitude, longitude } = pos.coords;
            status.textContent = `Sua localização: Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`;
            window._localizacaoAtual = { lat: latitude, lon: longitude };
            atualizarTudo(window._localizacaoAtual);
        },
        (err) => {
            status.textContent = 'Não foi possível obter a localização.';
            atualizarTudo();
        }
    );
}

async function adicionarEndereco(event) {
    event.preventDefault();
    const input = document.getElementById('endereco');
    const endereco = input.value.trim();
    if (endereco) {
        const coords = await obterCoordenadas(endereco);
        const enderecos = carregarEnderecos();
        enderecos.push({ endereco, lat: coords ? coords.lat : null, lon: coords ? coords.lon : null });
        salvarEnderecos(enderecos);
        if (window._localizacaoAtual) {
            atualizarTudo(window._localizacaoAtual);
        } else {
            atualizarTudo();
        }
        input.value = '';
    }
}

document.getElementById('form-endereco').addEventListener('submit', adicionarEndereco);

// Sugestão automática de endereços usando Geoapify
const inputEndereco = document.getElementById('endereco');
const sugestoesDiv = document.getElementById('sugestoes-endereco');
let timeoutSugestao = null;
const geoapifyApiKey = '60034d727bf4475580d1c786224d4aca';

inputEndereco.addEventListener('input', function() {
    const valor = this.value.trim();
    sugestoesDiv.innerHTML = '';
    if (timeoutSugestao) clearTimeout(timeoutSugestao);
    if (valor.length < 3) return;
    timeoutSugestao = setTimeout(async () => {
        const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(valor)}&limit=5&lang=pt&apiKey=${geoapifyApiKey}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (Array.isArray(data.features)) {
            sugestoesDiv.innerHTML = '';
            data.features.forEach(item => {
                const div = document.createElement('div');
                div.textContent = item.properties.formatted;
                div.onclick = () => {
                    inputEndereco.value = item.properties.formatted;
                    sugestoesDiv.innerHTML = '';
                };
                sugestoesDiv.appendChild(div);
            });
        }
    }, 300);
});

// Fecha sugestões ao clicar fora
inputEndereco.addEventListener('blur', function() {
    setTimeout(() => { sugestoesDiv.innerHTML = ''; }, 200);
});

document.addEventListener('DOMContentLoaded', () => {
    mostrarLocalizacaoAtual();
}); 
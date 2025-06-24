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
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco)}`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data && data[0]) {
            return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
        console.log('Endereço não encontrado:', endereco);
        return null;
    } catch (error) {
        console.error('Erro ao buscar coordenadas:', error);
        return null;
    }
}

// Função para carregar endereços do LocalStorage
function carregarEnderecos() {
    return JSON.parse(localStorage.getItem('enderecos')) || [];
}

// Função para salvar endereços no LocalStorage
function salvarEnderecos(enderecos) {
    localStorage.setItem('enderecos', JSON.stringify(enderecos));
}

// Algoritmo do Vizinho Mais Próximo para rota otimizada
function calcularRotaOtimizada(localizacaoAtual, enderecos) {
    if (!localizacaoAtual || enderecos.length === 0) return [];
    
    const enderecosComCoords = enderecos.filter(e => e.lat && e.lon);
    if (enderecosComCoords.length === 0) return [];
    
    const rota = [];
    const naoVisitados = [...enderecosComCoords];
    let posicaoAtual = { lat: localizacaoAtual.lat, lon: localizacaoAtual.lon };
    
    while (naoVisitados.length > 0) {
        // Encontrar o endereço mais próximo da posição atual
        let maisProximo = null;
        let menorDistancia = Infinity;
        let indiceMaisProximo = -1;
        
        naoVisitados.forEach((endereco, index) => {
            const distancia = calcularDistancia(
                posicaoAtual.lat, posicaoAtual.lon,
                endereco.lat, endereco.lon
            );
            if (distancia < menorDistancia) {
                menorDistancia = distancia;
                maisProximo = endereco;
                indiceMaisProximo = index;
            }
        });
        
        if (maisProximo) {
            rota.push(maisProximo);
            posicaoAtual = { lat: maisProximo.lat, lon: maisProximo.lon };
            naoVisitados.splice(indiceMaisProximo, 1);
        }
    }
    
    return rota;
}

let mapa = null;
let rotaLayer = null;
let marcadorEntregador = null;
let watchId = null; // Para o rastreamento em tempo real

// Função para obter nome da cidade através de geocodificação reversa
async function obterNomeCidade(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
        const resp = await fetch(url);
        const data = await resp.json();
        
        if (data && data.address) {
            // Tentar obter cidade, município ou localidade
            const cidade = data.address.city || 
                          data.address.town || 
                          data.address.municipality || 
                          data.address.county ||
                          data.address.state ||
                          'Localização desconhecida';
            return cidade;
        }
        return 'Localização desconhecida';
    } catch (error) {
        console.error('Erro ao obter cidade:', error);
        return 'Localização desconhecida';
    }
}

// Função para atualizar marcador do entregador
function atualizarMarcadorEntregador(localizacao) {
    if (!mapa) return;
    
    if (marcadorEntregador) {
        mapa.removeLayer(marcadorEntregador);
    }
    
    marcadorEntregador = L.marker([localizacao.lat, localizacao.lon], {
        icon: L.divIcon({
            className: 'marcador-entregador',
            html: '🚚',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        })
    }).addTo(mapa);
    
    marcadorEntregador.bindPopup('Você (Entregador)').openPopup();
}

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
    
    // Calcular rota otimizada
    const rotaOtimizada = calcularRotaOtimizada(localizacaoAtual, enderecos);
    
    const pontos = [];
    if (localizacaoAtual) {
        pontos.push([localizacaoAtual.lat, localizacaoAtual.lon]);
        // Marcador do entregador será atualizado pela função específica
    }
    
    // Adicionar marcadores na ordem da rota otimizada
    rotaOtimizada.forEach((e, index) => {
        pontos.push([e.lat, e.lon]);
        L.marker([e.lat, e.lon]).addTo(mapa).bindPopup(`${index + 1}. ${e.endereco}`);
    });
    
    if (pontos.length > 1) {
        rotaLayer = L.polyline(pontos, {color: 'blue'}).addTo(mapa);
        mapa.fitBounds(rotaLayer.getBounds(), {padding: [30, 30]});
    } else if (pontos.length === 1) {
        mapa.setView(pontos[0], 13);
    }
    
    // Atualizar marcador do entregador
    if (localizacaoAtual) {
        atualizarMarcadorEntregador(localizacaoAtual);
    }
}

function renderizarEnderecos(localizacaoAtual) {
    const lista = document.getElementById('enderecos');
    lista.innerHTML = '';
    let enderecos = carregarEnderecos();
    
    // Calcular rota otimizada para ordenar a lista
    const rotaOtimizada = calcularRotaOtimizada(localizacaoAtual, enderecos);
    
    // Criar mapa de endereços para facilitar a busca
    const mapaEnderecos = new Map();
    enderecos.forEach(e => mapaEnderecos.set(e.endereco, e));
    
    // Renderizar na ordem da rota otimizada
    rotaOtimizada.forEach((e, idx) => {
        const li = document.createElement('li');
        const distancia = calcularDistancia(localizacaoAtual.lat, localizacaoAtual.lon, e.lat, e.lon);
        li.textContent = `${idx + 1}. ${e.endereco} (${distancia.toFixed(2)} km)`;
        const btn = document.createElement('button');
        btn.textContent = 'Entregue';
        btn.style.marginLeft = '10px';
        btn.disabled = false;
        btn.onclick = () => {
            removerEndereco(e.endereco, localizacaoAtual);
        };
        li.appendChild(btn);
        lista.appendChild(li);
    });
    
    // Adicionar endereços sem coordenadas no final
    enderecos.forEach(e => {
        if (!e.lat || !e.lon) {
            const li = document.createElement('li');
            li.textContent = `${e.endereco} (sem coordenadas)`;
            const btn = document.createElement('button');
            btn.textContent = 'Entregue';
            btn.style.marginLeft = '10px';
            btn.disabled = false;
            btn.onclick = () => {
                removerEndereco(e.endereco, localizacaoAtual);
            };
            li.appendChild(btn);
            lista.appendChild(li);
        }
    });
}

function removerEndereco(enderecoParaRemover, localizacaoAtual) {
    let enderecos = carregarEnderecos();
    enderecos = enderecos.filter(e => e.endereco !== enderecoParaRemover);
    salvarEnderecos(enderecos);
    atualizarTudo(localizacaoAtual);
}

function atualizarTudo(localizacaoAtual) {
    const enderecos = carregarEnderecos();
    renderizarEnderecos(localizacaoAtual);
    desenharRotaNoMapa(localizacaoAtual, enderecos);
}

// Função para iniciar rastreamento em tempo real
async function iniciarRastreamentoTempoReal() {
    if (!navigator.geolocation) {
        console.log('Geolocalização não suportada');
        return;
    }
    
    // Parar rastreamento anterior se existir
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
    }
    
    // Iniciar novo rastreamento
    watchId = navigator.geolocation.watchPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            const novaLocalizacao = { lat: latitude, lon: longitude };
            
            // Atualizar localização global
            window._localizacaoAtual = novaLocalizacao;
            
            // Obter nome da cidade
            const cidade = await obterNomeCidade(latitude, longitude);
            
            // Atualizar status com nome da cidade
            const status = document.getElementById('status-localizacao');
            status.textContent = `Sua localização: ${cidade}`;
            
            // Atualizar marcador no mapa
            atualizarMarcadorEntregador(novaLocalizacao);
            
            // Recalcular rota otimizada com nova posição
            atualizarTudo(novaLocalizacao);
        },
        (err) => {
            console.error('Erro no rastreamento:', err);
            const status = document.getElementById('status-localizacao');
            status.textContent = 'Erro no rastreamento da localização';
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000
        }
    );
}

// Função para mostrar localização atual e iniciar rastreamento
async function mostrarLocalizacaoAtual() {
    const status = document.getElementById('status-localizacao');
    if (!navigator.geolocation) {
        status.textContent = 'Geolocalização não suportada pelo navegador.';
        atualizarTudo();
        return;
    }
    status.textContent = 'Obtendo localização...';
    
    // Obter posição inicial
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            
            // Obter nome da cidade
            const cidade = await obterNomeCidade(latitude, longitude);
            
            status.textContent = `Sua localização: ${cidade}`;
            window._localizacaoAtual = { lat: latitude, lon: longitude };
            atualizarTudo(window._localizacaoAtual);
            
            // Iniciar rastreamento em tempo real
            iniciarRastreamentoTempoReal();
        },
        (err) => {
            status.textContent = 'Não foi possível obter a localização.';
            atualizarTudo();
        }
    );
}

// Função para parar rastreamento (opcional)
function pararRastreamento() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
        console.log('Rastreamento parado');
    }
}

async function adicionarEndereco(event) {
    event.preventDefault();
    const input = document.getElementById('endereco');
    const endereco = input.value.trim();
    if (endereco) {
        console.log('Adicionando endereço:', endereco);
        const coords = await obterCoordenadas(endereco);
        const enderecos = carregarEnderecos();
        const novoEndereco = { endereco, lat: coords ? coords.lat : null, lon: coords ? coords.lon : null };
        enderecos.push(novoEndereco);
        salvarEnderecos(enderecos);
        console.log('Endereços salvos:', enderecos);
        if (window._localizacaoAtual) {
            atualizarTudo(window._localizacaoAtual);
        } else {
            atualizarTudo();
        }
        input.value = '';
        
        // Mostrar mensagem se não conseguiu coordenadas
        if (!coords) {
            alert('Atenção: Não foi possível obter as coordenadas para este endereço. Ele será adicionado à lista, mas não aparecerá no mapa.');
        }
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
// Include onscan.js
frappe.pages['posapp'].on_page_load = function (wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'POS Awesome',
		single_column: true
	});

	if (frappe.PosApp && frappe.PosApp.posapp) {
		this.page.$PosApp = new frappe.PosApp.posapp(this.page);
	} else {
		console.error("POS Awesome app not properly loaded. Please check if all JavaScript files are loaded correctly.");
		frappe.msgprint({
			title: __('Error'),
			indicator: 'red',
			message: __('POS Awesome app not properly loaded. Please contact your system administrator.')
		});
		return;
	}

	$('div.navbar-fixed-top').find('.container').css('padding', '0');

	// Add PWA manifest link
	$("head").append("<link rel='manifest' href='/assets/posawesome/manifest.json'>");
	$("head").append("<meta name='theme-color' content='#0097A7'>");
	$("head").append("<meta name='apple-mobile-web-app-capable' content='yes'>");
	$("head").append("<meta name='apple-mobile-web-app-status-bar-style' content='black'>");
	$("head").append("<meta name='apple-mobile-web-app-title' content='POS Awesome'>");
	$("head").append("<link rel='apple-touch-icon' href='/assets/posawesome/icons/icon-192x192.png'>");

	$("head").append("<link href='/assets/posawesome/node_modules/vuetify/dist/vuetify.min.css' rel='stylesheet'>");
	$("head").append("<link rel='stylesheet' href='https://cdn.jsdelivr.net/npm/@mdi/font@6.x/css/materialdesignicons.min.css'>");
	$("head").append("<link rel='stylesheet' href='https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900' />");
	
	// Register Service Worker for offline functionality
	if ('serviceWorker' in navigator) {
		window.addEventListener('load', async () => {
			try {
				// First unregister any existing service workers
				const existingReg = await navigator.serviceWorker.getRegistration();
				if (existingReg) {
					await existingReg.unregister();
				}

				// Register new service worker with correct path
				const registration = await navigator.serviceWorker.register('/assets/posawesome/js/posapp/service-worker.js', {
					scope: '/'
				});
				
				console.log('Service Worker registered with scope:', registration.scope);
				
				// Force update
				if (registration.active) {
					registration.active.postMessage({ type: 'SKIP_WAITING' });
				}
				
				// Setup periodic sync if available
				if ('periodicSync' in registration) {
					try {
						await registration.periodicSync.register('sync-pos-data', {
							minInterval: 24 * 60 * 60 * 1000 // One day in ms
						});
						console.log('Periodic sync registered successfully');
					} catch (err) {
						console.warn('Periodic sync registration failed:', err);
					}
				}

				// Initialize IndexedDB for offline storage
				if (!window.offlineStorage) {
					try {
						const { default: OfflineStorage } = await import('/posawesome/public/js/posapp/services/offlineStorage.js');
						window.offlineStorage = new OfflineStorage('posAwesomeDB', 1);
						await window.offlineStorage.init();
						console.log('Offline storage initialized successfully');
					} catch (err) {
						console.error('Failed to initialize offline storage:', err);
						frappe.show_alert({
							message: __('Failed to initialize offline storage. Some offline features may not work.'),
							indicator: 'red'
						});
					}
				}
			} catch (error) {
				console.error('Service Worker registration failed:', error);
				frappe.show_alert({
					message: __('Failed to register service worker. Offline mode may not work properly.'),
					indicator: 'red'
				});
			}
		});

		// Listen for online/offline events
		window.addEventListener('online', async () => {
			console.log('Device is online');
			frappe.show_alert({
				message: __('You are back online'),
				indicator: 'green'
			});
			
			// When coming back online, try to sync data
			if (window.offlineStorage) {
				try {
					await window.offlineStorage.triggerSync();
					console.log('Offline data sync triggered');
				} catch (err) {
					console.error('Failed to sync offline data:', err);
				}
			}
		});

		window.addEventListener('offline', () => {
			console.log('Device is offline');
			frappe.show_alert({
				message: __('You are offline. Some features may be limited.'),
				indicator: 'red'
			});
		});
	}

	// Check if we're in development mode and load PWA verification tool
	// To enable this, add "pwa_check=1" to the URL query parameters
	if (window.location.search.includes('pwa_check=1')) {
		$.getScript('/assets/posawesome/js/pwa-check.js')
			.done(function() {
				console.log('PWA verification tool loaded successfully');
			})
			.fail(function(jqxhr, settings, exception) {
				console.error('Failed to load PWA verification tool:', exception);
			});
	}

	// Listen for POS Profile registration
	frappe.realtime.on('pos_profile_registered', () => {
		const update_totals_based_on_tax_inclusive = () => {
			console.log("Updating totals based on tax inclusive settings");
			const posProfile = this.page.$PosApp.pos_profile;

			if (!posProfile) {
				console.error("POS Profile is not set.");
				return;
			}

			frappe.call({
				method: 'frappe.get_cached_value',
				args: {
					doctype: 'POS Profile',
					name: posProfile,
					fieldname: 'posa_tax_inclusive'
				},
				callback: function(response) {
					if (response.message !== undefined) {
						const posa_tax_inclusive = response.message;
						const totalAmountField = document.getElementById('input-v-25');
						const grandTotalField = document.getElementById('input-v-29');

						if (totalAmountField && grandTotalField) {
							if (posa_tax_inclusive) {
								totalAmountField.value = grandTotalField.value;
								console.log("Total amount copied from grand total:", grandTotalField.value);
							} else {
								totalAmountField.value = "";
								console.log("Total amount cleared because checkbox is unchecked.");
							}
						} else {
							console.error('Could not find total amount or grand total field by ID.');
						}
					} else {
						console.error('Error fetching POS Profile or POS Profile not found.');
					}
				}
			});
		};

		update_totals_based_on_tax_inclusive();
	});
};

//Only if PT as we are not being able to load from pt.csv
if (frappe.boot.lang == "pt") {
	$.extend(
		frappe._messages, {
		"Type": "Tipo",
		"is Offer": "é Oferta",
		"Total Qty": "Qtd Total",
		"Customer": "Cliente",
		"Items Group": "Grupo de Itens",
		"Search Items": "Procurar Itens",
		"Additional Discount": "Desconto Adicional",
		"Items Discounts": "Descontos de Itens",
		"HOLD": "EM PAUSA",
		"Hold": "Em Pausa",
		"RETURN": "DEVOLUÇÃO",
		"Return": "Devolução",
		"CANCEL": "CANCELAR",
		"NEW": "NOVO",
		"PAY": "PAGAR",
		"Order": "Ordem",
		"Available QTY": "QTD Disponivel",
		"QTY": "QTD",
		"Discount Percentage": "Percentagem de Desconto",
		"Price list Rate": "Taxa de Lista de Preço",
		"Group": "Grupo",
		"Stock QTY": "QTD de Stock",
		"Stock UOM": "UDM de Stock",
		"Card": "Cartão",
		"Offers": "Ofertas",
		"Applied": "Aplicadas",
		"There is no Customer !": "Não tem Cliente !",
		"There is no Items !": "Não tem Itens !",
		"The existing quantity of item {0} is not enough": "A quantidade existente do item {0} não é suficiente",
		"Maximum discount for Item {0} is {1}%": "Desconto Maximo para o Item {0} é {1}%",
		"Selected serial numbers of item {0} is incorrect": "Numeros de serie selecionado do item {0} é incorrecto",
		"The existing batch quantity of item {0} is not enough": "A quantidade existente do lote para o item {0} não é suficiente",
		"The discount should not be higher than {0}%": "O desconto não deve ser maior que {0}%",
		"Return Invoice Total Not Correct": "Total da Devolução da Factura não está Correcto",
		"Return Invoice Total should not be higher than {0}": "Total da Devolução da Factura não deve maior que {0}",
		"The item {0} cannot be returned because it is not in the invoice {1}": "O item {0} não pode ser devolvido porque não está na factura {1}",
		"The QTY of the item {0} cannot be greater than {1}": "A QTD do item {0} não pode ser maior que {1}",
		"Selected Serial No QTY is {0} it should be {1}": "A QTD selecionada do Num. de Serie é {0} deveria ser {1}",
		"Loyalty Point Offer Applied": "Oferta de Pontos de Lealdade Aplicada",
		"Loyalty Points": "Pontos de Lealdade",
		"Paid Amount": "Valor Pago",
		"To Be Paid": "A ser Pago",
		"Cash": "Numerário",
		"Tax and Charges": "Taxas e Impostos",
		"Discount Amount": "Valor de Desconto",
		"Total Amount": "Valor Total",
		"Totoal Amount": "Valor Total",
		"Grand Amount": "Total Geral",
		"Back": "Voltar",
		"Submit Payments": "Submeter Pagamentos",
		"Give Item": "Entregar Item",
		"New Offer Available": "Nova Oferta Disponivel",
		"POS Offers": "Ofertas POS",
		"Customer contact created successfully.": "Contacto de Cliente criado com sucesso.",
		"Customer Address created successfully.": "Endereço de Cliente criado com sucesso.",
		"Customer contact updated successfully.": "Contacto de Cliente actualizacdo com sucesso.",
		"Offer": "Oferta",
		"Apply On": "Aplicar Em",
		"Offer Applied": "Oferta Aplicada",
		"Opening Amount": "Valor de Abertura",
		"Closing Amount": "Valor de Fecho",
		"Expected Amount": "Valor Esperado",
		"Difference": "Diferença",
		"Close": "Fechar",
		"Submit": "Submeter",
		"Closing POS Shift": "Fechando Turno do POS",
		"Select Hold Invoice": "Selecionar Factura em Pausa",
		"Customer Info": "Info do Cliente",
		"Add New Address": "Adicionar Novo Endereço",
		"New Customer": "Novo Cliente",
		"Create POS Opening Shift": "Criar Turno de Abertura POS",
		"Select Return Invoice": "Selecione a Factura para Devolução",
		"Close Shift": "Fechar Turno",
		"Pages": "Paginas",
		"Customer not found": "Cliente não encontrado",
		"Customer Name": "Nome do Cliente",
		"Batch No Available QTY": "QTD Disponivel para o Lote",
		"Batch No Expiry Date": "Data de Expiração do Lote",
		"Batch No": "Num. do Lote",
		"Use Customer Credit": "Usar Crédito Cliente",
		"Is Credit Sale": "É Venda a Crédito",
		"Due Date": "Data de Expiração",
		// Add new translations for offline features
		"You are offline. Some features may be limited.": "Você está offline. Algumas funções podem estar limitadas.",
		"pending invoice": "fatura pendente",
		"pending invoices": "faturas pendentes",
		"Synchronizing offline data...": "Sincronizando dados offline...",
		"All offline data has been synchronized": "Todos os dados offline foram sincronizados",
		"Failed Invoices": "Faturas com Falha",
		"The following invoices could not be synchronized:": "As seguintes faturas não puderam ser sincronizadas:",
		"Invoice": "Fatura",
		"Error": "Erro",
		"Unknown error": "Erro desconhecido",
		"Retry All": "Tentar Novamente Todos"
	});
}
const MAX_CURRENCIES = 15;
const MIN_CURRENCIES = 2;
var count_currencies = 0;
var loading_count = 0;
var background_page = chrome.extension.getBackgroundPage();
var timer;

function onCurrencyChange(event) {
    var option = event.target.options[event.target.selectedIndex];
    localStorage.setItem(event.target.id, option.value);

    update(event.target.name);
}

function onValueChange(event) {
    update(event.target.name);
}

function onKeyPress(event) {
    return (
        (event.keyCode > 47 && event.keyCode < 58) ||
        event.keyCode == 44 ||
        event.keyCode == 46
    );
}

function onPaste(event) {
    var value = event.clipboardData.getData("Text");
	value = value.replace(/[^0-9.,]/g, "");
	
    event.returnValue = false;
    event.target.value = value;
}

function addCurrency(init) {
    var input_value = document.createElement("input");
    input_value.type = "text";
    input_value.id = "value" + count_currencies;
    input_value.name = count_currencies;
    input_value.value = "loading...";
    input_value.setAttribute("maxlength", 12);
    input_value.addEventListener("keyup", onValueChange, false);
	input_value.addEventListener("paste", onPaste, false);
	input_value.onclick = function() { this.setSelectionRange(0, this.value ? this.value.length : 0); }
    input_value.onkeypress = function () { return onKeyPress(event) };

    var td_left = document.createElement("td");
    td_left.setAttribute("class", "paddingtd");
    td_left.appendChild(input_value);

    var select_currency = document.createElement("select");
    select_currency.id = "currency" + count_currencies;
    select_currency.name = count_currencies;
    select_currency.addEventListener("keypress", onCurrencyChange, false);
    select_currency.addEventListener("change", onCurrencyChange, false);

    for (var currency in currenciesJSON) {
        var option = document.createElement("option");
        option.value = currency;
        option.text = currenciesJSON[currency].name;
        select_currency.appendChild(option);
    }

    var td_right = document.createElement("td");
    td_right.setAttribute("class", "paddingtd");
    td_right.appendChild(select_currency);

    var tr = document.createElement("tr");
    tr.id = "trCurrency" + count_currencies;
    tr.appendChild(td_left);
    tr.appendChild(td_right);

    var container = document.getElementById("currency");
    container.appendChild(tr);

    changeVisibilityRemove(true);

    if (!init) {
        localStorage.setItem("currency" + count_currencies, "");
        count_currencies++;
        update(0);

        if (count_currencies == MAX_CURRENCIES) changeVisibilityAdd(false);
    }
}

function removeCurrency() {
    if (count_currencies <= MIN_CURRENCIES) return;

    count_currencies--;
    localStorage.removeItem("currency" + count_currencies);
    var container = document.getElementById("currency");

    container.removeChild(
        document.getElementById("trCurrency" + count_currencies)
    );

    if (count_currencies < MAX_CURRENCIES) changeVisibilityAdd(true);

    if (count_currencies <= MIN_CURRENCIES) changeVisibilityRemove(false);
}

function changeVisibilityAdd(visible) {
    document.getElementById("btnAdd").disabled = !visible;
}

function changeVisibilityRemove(visible) {
    document.getElementById("btnRemove").disabled = !visible;
}

function update(id) {
    var value = document.getElementById("value" + id).value;
    value = value.replace(",", ".");

    if (isNaN(value)) return;

    localStorage.setItem("last_id", id);
    localStorage.setItem("last_value", value);

    var fromSelectCurrency = document.getElementById("currency" + id);
    var fromOptionCurrency =
        fromSelectCurrency.options[fromSelectCurrency.selectedIndex];
    var from = fromOptionCurrency.value;

    for (i = 0; i < count_currencies; i++) {
        if (id == i) continue;

        var current_element = document.getElementById("value" + i);

        var toSelectCurrency = document.getElementById("currency" + i);
        var toOptionCurrency =
            toSelectCurrency.options[toSelectCurrency.selectedIndex];
        var to = toOptionCurrency.value;

        if (from == to || value == "") current_element.value = value;
        else convertValue(current_element, value, from, to);
    }
}

function setSelectedIndex(s, value) {
    var select = document.getElementById(s);

    for (i = 0; i < select.options.length; i++) {
        if (select.options[i].value == value) {
            select.options[i].selected = true;
            break;
        }
    }
}

function convertValue(element, value, from, to) {
    document
        .getElementById("loading")
        .setAttribute("style", "visibility:visible;");
    element.value = "loading...";
    loading_count++;

    background_page.convertValue(value, from, to, function (response) {
        if (response.status == "error") {
			element.value = "timeout";
		}
		else
		{
			const precision = response.value > 1000 ? 0 : response.value > 10 ? 2 : response.value > 1 ? 4 : 6;
			element.value = response.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: precision, style: 'currency', currency: to });
		}

        loading_count--;

        if (loading_count == 0)
            document
                .getElementById("loading")
                .setAttribute("style", "visibility:hidden;");
    });
}

function init() {
    for (count_currencies = 0; count_currencies < MAX_CURRENCIES; count_currencies++) {
        var currency = localStorage.getItem("currency" + count_currencies);

        if (currency == undefined) {
            if (count_currencies == 0) currency = "EUR";
            else if (count_currencies == 1) currency = "USD";
            else break;

            localStorage.setItem("currency" + count_currencies, currency);
        }

        addCurrency(true);
        setSelectedIndex("currency" + count_currencies, currency);
    }

    if (count_currencies == MAX_CURRENCIES) changeVisibilityAdd(false);

    var id = 0;
    var value = 1;

    var last_id = localStorage.getItem("last_id");
    var last_value = localStorage.getItem("last_value");

    if (last_id != null && last_value != null) {
        id = last_id;
        value = last_value;
    }

    var first_value = document.getElementById("value" + id);
    first_value.value = value;
    first_value.select();
    first_value.focus();

    update(id);
}

document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("btnAdd").addEventListener("click", function () {
        addCurrency(false);
    });
    document
        .getElementById("btnRemove")
        .addEventListener("click", removeCurrency);
    init();
});

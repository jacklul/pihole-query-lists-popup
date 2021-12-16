// ==UserScript==
// @name         Query Lists Popup (Pi-hole)
// @version      0.1.0
// @license      MIT
// @description  Adds buttons in the tables to query the lists in modal popup
// @author       Jack'lul <jacklul.github.io>
// @source       https://github.com/jacklul/pihole-query-lists-popup/
// @downloadURL  https://github.com/jacklul/pihole-query-lists-popup/pihole-query-lists-popup.user.js
// @match        http://pi.hole/admin/
// @match        http://pi.hole/admin/index.php*
// @match        http://pi.hole/admin/queries.php*
// @match        http://pi.hole/admin/db_queries.php*
// @match        http://pi.hole/admin/db_lists.php*
// @match        http://pi.hole/admin/groups-domains.php*
// ==/UserScript==

(function() {
    'use strict';

    if ($) {
        let DataTables_API;

        const tables = {
            '#domainsTable': {
                'type': 'domains',
                'selector': 'td:first-child > code',
                'insert': 'td:first-child'
            },
            '#all-queries': {
                'type': 'queries',
                'selector': 'td:nth-child(3)',
                'insert': 'td:last-child'
            },
            '.table.table-bordered:not(.table-striped)': {
                'api': false,
                'type': 'top',
                'selector': 'td:first-child'
            }
        };
        const address = 'http' + (location.protocol === 'https:' ? 's' : '') + '://' + window.location.hostname;

        $(document).ready(function() {
            if (!$('#queryModal').length) {
                $('body').append('<div id="queryModal"></div>');
            }

            findTable();
        });

        function findTable() {
            const checkExist = setInterval(function() {
                let selector, type, api;

                $.each(tables, function(key, value) {
                    if ($(key + ' > tbody > tr').find(value.selector).length) {
                        selector = key;
                        type = value.type;
                        api = value.api;

                        if (typeof api === 'undefined') {
                            api = true;
                        }

                        return false;
                    }
                });

                if (typeof selector === 'undefined' || selector === '' || $(selector).length === 0) {
                    return;
                }

                let table = selector.split(' ')[0];
                if ($(table).length === 0) {
                    return;
                }

                clearInterval(checkExist);
                attachToDomains(table, type);

                if (api === true) {
                    DataTables_API = $(table).dataTable().api();
                    DataTables_API.on('draw', function(e, settings, json) {
                        attachToDomains(table, type);
                    });
                }

                if (!$(table).data('query-lists-userscript')) {
                    $('body').on('click', table + ' > tbody > tr #query-lists-link[data-domain]', function(e) {
                        e.preventDefault();

                        const url = $(this).attr('href');
                        const regex = /\?domain=(.*?)(\&exact|$)/g;
                        const match = regex.exec(url);

                        if (typeof match[1] === "undefined") {
                            return;
                        }

                        openModal($('#queryModal'), 'Query lists (' + (url.match('&exact') ? 'exact' : 'partial') + '): <b>' + match[1] + '</b>', 'Preparing...');
                        $('#queryModal .modal-body p').attr('data-domain', match[1]);

                        doAjaxRequest(url, match[1]);
                    });
                    $(table).data('query-lists-userscript', true);
                }
            }, 100);
        }

        function attachToDomains(selector, page_type) {
            $(selector + ' > tbody > tr').each(function(index, tr) {
                let entry, insert, domain;

                // db_lists.php - skip 'Top Clients'
                if (page_type === 'top' && $(tr).parent().find('tr:nth-child(1) th:nth-child(1)').html() === 'Client') {
                    return;
                }

                entry = tables[selector].selector;
                domain = $(tr).find(entry).html();

                if ($(tr).find(' #query-lists-link').length === 0 && typeof domain !== 'undefined') {
                    if (page_type === 'domains') {
                        const type = $(tr).find('td:nth-child(2) select option:selected').html();

                        // Not for regex entries
                        if (type.indexOf('Regex') != -1) {
                            return;
                        }
                    } else if (page_type === 'queries') {
                        // Add 'Search' column if it is not already there
                        if ($(selector + ' > thead > tr > th:nth-child(7)').html() !== 'Search' && $(selector + ' > thead > tr > th:nth-child(8)').html() !== 'Query') {
                            $(selector + ' > thead > tr').append('<th>Query</th>');
                            $(selector + ' > tfoot > tr').append('<th>Query</th>');
                        }

                        $(tr).append('<td></td>');
                    } else if (page_type === 'top') {
                        // Extract domain from links on the dashboard page
                        if (domain.indexOf('href') != -1) {
                            const matches = domain.match(/href=.*domain=(.*)\"/);

                            if (matches !== null && matches.length > 0) {
                                domain = matches[1];
                            } else {
                                return;
                            }
                        }
                    }

                    insert = tables[selector].insert;
                    if (typeof tables[selector].insert === 'undefined') {
                        insert = entry;
                    }

                    // Split blocked CNAME entries allowing to query both of them separately
                    if (domain.indexOf('(blocked') != -1) {
                        const matches = domain.match(/(.*)\n\(blocked (.*)\)/);

                        $.each(matches, function(index, value) {
                            if (value.indexOf(' ') === -1) {
                                insertClickable($(tr).find(insert), value, '<br>');
                            }
                        });
                    } else {
                        insertClickable($(tr).find(insert), domain, (page_type === 'queries' ? '' : ' '));
                    }

                    // Trim data from any starting/ending br's
                    const html = $(tr).find(insert).html();
                    if (html) {
                        $(tr).find(insert).html(html.replace(/^(<br>)+|(<br>)+$/g, ""));
                    }
                }
            });
        }

        function insertClickable(selector, domain, content_before = ' ') {
            $(selector).append(content_before + '<a href="' + address + '/admin/scripts/pi-hole/php/queryads.php?domain=' + domain + '&exact" id="query-lists-link" title="Click to query the lists for exact match:\n' + domain + '" style="cursor: pointer;" data-domain="' + domain + '" data-exact="true"><i class="fa fa-fw fa-search"></i></a>');
            $(selector).append('<a href="' + address + '/admin/scripts/pi-hole/php/queryads.php?domain=' + domain + '" id="query-lists-link" title="Click to query the lists for partial match:\n' + domain + '" style="cursor: pointer;" data-domain="' + domain + '"><i class="fa fa-fw fa-search-plus"></i></a>');
        }

        function doAjaxRequest(url, domain) {
            $.ajax({
                url: url,
                beforeSend: function(jqXHR, settings) {
                    $('#queryModal .modal-body p').html('Loading...');
                }
            }).done(function(html) {
                if (html.indexOf('data: ') !== -1) {
                    if ($('#queryModal .modal-body p').attr('data-domain') !== domain) {
                        return;
                    }

                    $('#queryModal .modal-body p').css({'white-space': 'pre', 'display': 'block', 'unicode-bidi': 'embed'});

                    // Cleanup the output
                    html = html.replace(/data:\s{0,2}/g, '');
                    html = html.replace(/^\s*\n/gm, '')
                } else {
                    html = 'API returned unexpected data';
                }

                $('#queryModal .modal-body p').html(html);
            }).fail(function(jqXHR, textStatus, errorThrown) {
                $('#queryModal .modal-body p').html(textStatus + ' ' + errorThrown);
            });
        }

        function openModal(selector, heading, content) {
            let html = '<div id="modalWindow" class="modal fade in" style="display:none; color: #fff !important; background: rgb(0, 0, 0, 0.75);">';
            html += '<div class="modal-header">';
            html += '<a class="close" data-dismiss="modal" style="color:#fff;opacity:1;">CLOSE</a>';
            html += '<h3>' + heading + '</h3>'
            html += '</div>';
            html += '<div class="modal-body">';
            html += '<p>';
            html += content;
            html += '</div>';
            html += '</div>';
            html += '</div>';

            selector.html(html);
            selector.find('#modalWindow').modal();
        }

        function isJsonString(str) {
            try {
                JSON.parse(str);
            } catch (e) {
                return false;
            }

            return true;
        }

        // This is a hack for 'top lists' pages to (re)add the clickable links after data is loaded through ajax
        const proxiedAjax = window.XMLHttpRequest.prototype.send;
        window.XMLHttpRequest.prototype.send = function() {
            var pointer = this;
            var intervalId = window.setInterval(function(){
                if (pointer.readyState != 4){
                    return;
                }

                if (isJsonString(pointer.responseText)) {
                    const obj = JSON.parse(pointer.responseText);

                    if (obj.top_queries || obj.top_domains || obj.top_ads) {
                        findTable();
                    }
                }

                clearInterval(intervalId);
            }, 1);

            return proxiedAjax.apply(this, [].slice.call(arguments));
        };
    }
})();
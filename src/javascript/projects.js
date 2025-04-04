$(document).ready(function () {

const userEmail = localStorage.getItem('userEmail');
if (!userEmail) {
    alert("You must be logged in to view projects.");
    window.location.href = '/'; // Redirect to login page if no email is found
    return;
}

var table = $('#dataTable').DataTable({
    processing: true,
    serverSide: true,
    ajax: function(data, callback, settings) {
        var page = settings._iDisplayStart / settings._iDisplayLength + 1; 
        var storedData = localStorage.getItem(`pageData_${page}`); 

        if (storedData && !data.search.value && !data.columns.some(col => col.search.value)) {
            callback(JSON.parse(storedData)); 
        } else {
            // If data is not stored or there's a search term, fetch it from the server
            console.log('Fetching data from the server for page', page);
            $.ajax({
                url: '/projects',
                type: 'POST',
                data: {
                    email: localStorage.getItem('userEmail'),
                    search: { value: data.search?.value || '' }, // Ensure search.value is defined
                    columnSearch: data.columns.map(column => column.search.value), // Column-specific search terms
                    start: settings._iDisplayStart,
                    length: settings._iDisplayLength
                },
                success: function(response) {
                    if (!data.search?.value && !data.columns.some(col => col.search.value)) {
                        // Store the server response in localStorage for future use only if no search
                        localStorage.setItem(`pageData_${page}`, JSON.stringify(response));
                    }

                    // Pass the response to DataTable
                    callback(response);
                },
                error: function(error) {
                    console.error('Error fetching data:', error);
                    callback({ data: [] }); 
                }
            });
        }
    },
    columns: [
        { data: 'id' },
        { data: 'name' },
        { data: 'description' },
        {
            data: 'allTodos',
            render: function(data, type, row) {
                return data.length > 0 ? data[0].creator.name : '';
            }
        },
        {
            data: 'todolistCompletionCounts',
            render: function(data, type, row) {
                // Render completion status for Critical
                const criticalStatus = data['Critical  '] ? data['Critical  '].status : '';
                const [criticalCompleted, criticalTotal] = criticalStatus.split('/');
                const criticalPercentage = (criticalCompleted / criticalTotal) * 100;
                let criticalColor = 'red';
                if (criticalPercentage === 100) criticalColor = 'green';
                else if (criticalPercentage > 0) criticalColor = 'orange';

                return `<span style="color: ${criticalColor};">${criticalStatus}</span>`;
            }
        },
        {
            data: 'todolistCompletionCounts',
            render: function(data, type, row) {
                // Render completion status for Pre-Requisites
                const preRequisitesStatus = data['Pre-Requisites'] ? data['Pre-Requisites'].status : '';
                const [preRequisitesCompleted, preRequisitesTotal] = preRequisitesStatus.split('/');
                const preRequisitesPercentage = (preRequisitesCompleted / preRequisitesTotal) * 100;
                let preRequisitesColor = 'red';
                if (preRequisitesPercentage === 100) preRequisitesColor = 'green';
                else if (preRequisitesPercentage > 0) preRequisitesColor = 'orange';

                return `<span style="color: ${preRequisitesColor};">${preRequisitesStatus}</span>`;
            }
        },
        {
            data: 'todolistCompletionCounts',
            render: function(data, type, row) {
                // Render completion status for Installation
                const installationStatus = data['Installation'] ? data['Installation'].status : '';
                const [installationCompleted, installationTotal] = installationStatus.split('/');
                const installationPercentage = (installationCompleted / installationTotal) * 100;
                let installationColor = 'red';
                if (installationPercentage === 100) installationColor = 'green';
                else if (installationPercentage > 0) installationColor = 'orange';

                return `<span style="color: ${installationColor};">${installationStatus}</span>`;
            }
        },
        {
            data: 'todolistCompletionCounts',
            render: function(data, type, row) {
                // Render completion status for Handover and Commissioning
                const handoverStatus = data['Handover and Commissioning'] ? data['Handover and Commissioning'].status : '';
                const [handoverCompleted, handoverTotal] = handoverStatus.split('/');
                const handoverPercentage = (handoverCompleted / handoverTotal) * 100;
                let handoverColor = 'red';
                if (handoverPercentage === 100) handoverColor = 'green';
                else if (handoverPercentage > 0) handoverColor = 'orange';

                return `<span style="color: ${handoverColor};">${handoverStatus}</span>`;
            }
        },
        {
            data: 'filteredTodos',
            render: function(data, type, row) {
                // Default value for date
                let latestDate = 'N/A';
                
                // Find the latest due_on date
                data.forEach(todo => {
                    if (todo.due_on) {
                        // If the latest date is not set or the current todo's due_on is later
                        if (latestDate === 'N/A' || new Date(todo.due_on) > new Date(latestDate)) {
                            latestDate = todo.due_on;
                        }
                    }
                });
            
                // Return the latest date or 'N/A' if none found
                return latestDate !== 'N/A' ? `<div>${latestDate}</div>` : 'N/A';
            }
        },
        {
            data: 'filteredHardwareContent',
            render: function(data, type, row) {
                // Render updated_at date for hardware-related todos
                return data.length > 0 ? data.map(hardware => hardware.due_on).join('<br>') : 'N/A';
            }
        },
        {
                data: 'allTodos',
                render: function(data, type, row) {
                    // Render 'Update' button
                    return `<button class="btn btn-primary update-btn" data-toggle="modal" data-target="#editModal" 
                                data-project="${row.name}" data-desc="${row.description}" data-project-id="${row.id}" 
                                data-todo-content="${[...new Set(row.allTodos.filter(todo => ['Commissioning,Demo & Handover', 'Demo & Handover'].includes(todo.content)).map(todo => todo.content))].join(',')}"
                                data-todo-id="${row.allTodos
                                .filter(todo => todo.content === 'Commissioning,Demo & Handover')  // Match the exact content
                                .map(todo => todo.id)
                                .join(',')}"

                                data-pmname="${row.allTodos[0].creator ? row.allTodos[0].creator.name : ''}" 
                                data-end="${row.filteredTodos[0]?.due_on}" 
                                data-todos='${JSON.stringify(row.allTodos).replace(/'/g, "&apos;").replace(/"/g, "&quot;")}'>
                                Update
                            </button>`;
                }
                },
    ],
    rowCallback: function(row, data) {
        $('td:eq(0)', row).html(
            `<input type="checkbox" class="rowCheckbox" value="${data.id}">`
        );
    },
    drawCallback: function(settings) {
        var page = settings._iDisplayStart / settings._iDisplayLength + 1;
        console.log('Current page:', page);
    }
});

// Function to store data in IndexedDB
function storeInIndexedDB(projects) {
    const request = indexedDB.open('projectsDB', 1);

    request.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' }); // Assuming 'id' is the unique identifier
        }
    };

    request.onsuccess = function (e) {
        const db = e.target.result;
        const transaction = db.transaction('projects', 'readwrite');
        const store = transaction.objectStore('projects');

        // Store each project individually
        projects.forEach(project => {
            store.put(project);
        });

        console.log("Projects stored in IndexedDB successfully.");
    };

    request.onerror = function (e) {
        console.error("Error storing projects in IndexedDB:", e.target.error);
    };
}

// Make the AJAX call to load the projects (always fresh data)
// function loadProjects() {
//     const userEmail = localStorage.getItem('userEmail');

//     // Check if email exists
//     if (!userEmail) {
//         alert("You must be logged in to view projects.");
//         window.location.href = '/'; // Redirect to login page if no email is found
//         return;
//     }

//     $.ajax({
//         url: '/projects/all',
//         type: 'GET',
//         data: { email: userEmail },
//         success: function(response) {
//             console.log("Projects loaded from server:", response);

//             // Ensure the response is valid
//             if (response && Array.isArray(response) && response.length > 0) {
//                 storeInIndexedDB(response); // Store data in IndexedDB
//             } else {
//                 console.error("No valid data received.");
//             }
//         },
//         error: function(error) {
//             console.error('Error loading projects:', error);
//         }
//     });
// }

// // Call the function to fetch and store projects
// loadProjects();


// $('#dataTable thead tr').clone(true).appendTo('#dataTable thead');
$('#dataTable thead tr:eq(1) th').each(function(i) {
    // $(this).html('<input type="text" class="form-control" placeholder="Search" />');
    $('input', this).on('keyup change', function() {
        if (table.column(i).search() !== this.value) {
            table.column(i).search(this.value).draw();
        }
    });
});
    $('#dataTable thead th:first-child').html('<input type="checkbox" id="selectAllCheckbox">');

    // Handle "Select All" checkbox logic
    $('#selectAllCheckbox').on('click', function () {
        var isChecked = this.checked;
        $('#dataTable tbody input.rowCheckbox').prop('checked', isChecked);
        table.rows().every(function () {
            var row = this.node();
            var rowId = this.id();
            if (isChecked) {
                table.row(row).select();
            } else {
                table.row(row).deselect();
            }
        });
        handleCheckboxSelection();
    });

    // Handle individual row checkbox selection
    $('#dataTable tbody').on('click', 'input.rowCheckbox', function() {
        var row = $(this).closest('tr');
        var isChecked = $(this).prop('checked');
        var rowId = table.row(row).id();
        
        if (isChecked) {
            table.row(row).select();
        } else {
            table.row(row).deselect();
        }

        handleCheckboxSelection();
    });

    // Handle row selection and deselection events
    table.on('select deselect', function () {
        handleCheckboxSelection();
    });

    // Handle the checkbox selection logic for selected rows
    function handleCheckboxSelection() {
        var selectedRowsData = table.rows({ selected: true }).data().toArray();
        var projectIds = selectedRowsData.map(row => row.id);
        console.log('Selected Rows Data:', selectedRowsData);
        console.log('Selected Project IDs:', projectIds);

        // Show/hide the action button based on whether any checkboxes are selected
        if (projectIds.length > 0) {
            $('#actionButton').show();
        } else {
            $('#actionButton').hide();
        }
    }

    // Handle the "Open Chart" button click
    $('#actionButton').on('click', function () {
        openChart();
    });

    function openChart() {
        // Get the selected rows data
        const selectedRowsData = table.rows({ selected: true }).data().toArray();

        if (selectedRowsData.length > 0) {
            // Extract project IDs from selected rows
            const projectIds = selectedRowsData.map(row => row.id); 
            const chartUrl = `/chart/${projectIds.join(',')}`;
            window.open(chartUrl, '_blank');
        } else {
            alert('Please select at least one project before opening the chart.');
        }
    }

    // Handle the search input for DataTable
    $('#dataTable thead input').on('keyup change', function() {
        var columnIndex = $(this).parent().index();
        if (columnIndex > 0) { 
            table
                .column(columnIndex)
                .search(this.value)
                .draw();
        }
    });

});

// Function to handle logout
function handleLogout() {
    // Show confirmation dialog
    const isConfirmed = confirm('Are you sure you want to logout?');
    if (isConfirmed) {
        localStorage.clear();

        window.location.href = '/';
    }
}

// Attach the handleLogout function to the click event of the logout button
document.getElementById('logoutButton').addEventListener('click', handleLogout);

function calculatePercentage(status) {
    const parts = status.split('/');
    const completed = parseInt(parts[0]);
    const total = parseInt(parts[1]);
    return total === 0 ? 100 : (completed / total) * 100;
}
function getStatusColor(percentage) {
    if (percentage === 100) {
        return 'green'; // Completed
    } else if (percentage > 0 && percentage < 100) {
        return 'yellow'; // In progress
    } else {
        return 'red'; // Not started
    }
}
$('#editModal').on('show.bs.modal', function (e) {
    var button = $(e.relatedTarget); 
    var projectId = button.data('project-id');
    var todos = button.data('todos'); 

    // If the 'todos' is a string, we need to parse it
    if (typeof todos === 'string') {
        todos = JSON.parse(todos);
    }

    // If end date is null or undefined, set a default value
    var endDate = button.data('end');
    if (endDate === null || endDate === undefined) {
        endDate = 'No End Date';
    }

    // Proceed with creating the tree structure and other modal content
    $('#todo-content-tree').empty();
    const groupedTodos = {};
    todos.forEach(todo => {
        const title = todo.parent ? todo.parent.title : 'No Title';
        groupedTodos[title] = groupedTodos[title] || [];
        groupedTodos[title].push(todo);
    });

    for (const title in groupedTodos) {
        const todosList = groupedTodos[title];
        const $titleListItem = $('<li>').append($('<span>', { class: 'caret', text: title }));
        const $contentUl = $('<ul>', { class: 'nested' });

        todosList.forEach(todo => {
            const $todoListItem = $('<li>');
            const $checkbox = $('<input>', { 
                type: 'checkbox', 
                class: 'todo-checkbox', 
                data: { todoId: todo.id, projectId: projectId, content: todo.content }
            });
            const $todoContent = $('<span>').text(todo.content);

            if (todo.completed) {
                $checkbox.prop('checked', true);
            }

            $todoListItem.append($checkbox, $todoContent);
            $contentUl.append($todoListItem);
        });

        $titleListItem.append($contentUl);
        $('#todo-content-tree').append($titleListItem);
    }
});


$('#dataTable').on('click', '.update-btn', function () {
    const projectId = $(this).data('project-id');
    const pmName = $(this).data('pmname'); 
    const end = $(this).data('end');        
    const content = $(this).data('todo-content');  
    const projectName = $(this).data('project');
    const description = $(this).data('desc');
    const todosData = $(this).data('todos');
    const todoid = $(this).data('todo-id');
    const todoidAttr = $(this).attr('data-todo-id'); 

    
    console.log("todoid",todoidAttr);
    

    // Log the details for debugging
    console.log("Project Id: " + projectId);
    console.log("Project Name: " + projectName);
    console.log("Description: " + description);
    console.log("PM Name: " + pmName);
    console.log("End Date: " + end);
    console.log("Content: " + content);

    // Populate the modal fields
    $('#editProject').val(projectName);
    $('#editdesc').val(description);
    $('#editpmName').val(pmName);
    $('#edit-date').val(end);
    $('#edit-todo-content').val(content);
    // $('#edit-todo-id').val(todoid);


    // Clear previous todo items
    $('#todo-content-tree').empty();

    // Get all todos from the button's data attributes (this is a JSON string)
    // const todos = JSON.parse($(this).data('todos'));
    const todos = typeof todosData === 'string' ? JSON.parse(todosData) : todosData;
    const commissionTodo = todos.find(todo => {
        // Adjust the condition as needed (e.g., exact match or includes)
        return todo.content && todo.content.trim() === "Commissioning,Demo & Handover";
    });
    
    // If found, use its ID; otherwise, you might fallback to what you had before.
    const todoIdToUpdate = commissionTodo ? commissionTodo.id : todoidAttr;
    console.log("Todo ID to update:", todoIdToUpdate);
    // Group todos by title
    const groupedTodos = {};
    todos.forEach(todo => {
        const title = todo.parent ? todo.parent.title : 'No Title'; 
        groupedTodos[title] = groupedTodos[title] || [];
        groupedTodos[title].push(todo);
    });

    // Build the tree structure for todos
    for (const title in groupedTodos) {
        const todosList = groupedTodos[title];
        const $titleListItem = $('<li>').append($('<span>', { class: 'caret', text: title }));
        const $contentUl = $('<ul>', { class: 'nested' });

        todosList.forEach(todo => {
            const $todoListItem = $('<li>');
            const $checkbox = $('<input>', { 
                type: 'checkbox', 
                class: 'todo-checkbox', 
                data: { todoId: todo.id, projectId: projectId, content: todo.content }
            });
            const $todoContent = $('<span>').text(todo.content);

            // Check if todo is completed and mark checkbox accordingly
            if (todo.completed) {
                $checkbox.prop('checked', true);
            }

            // Append checkbox and todo content to todo list item
            $todoListItem.append($checkbox, $todoContent);
            $contentUl.append($todoListItem);
        });

        $titleListItem.append($contentUl);
        $('#todo-content-tree').append($titleListItem);
    }
    $('#edit-todo-id').val(todoIdToUpdate);
    $('#saveChangesBtn').data('todo-id', todoIdToUpdate);

    // $('#saveChangesBtn').data('todo-id', todos[0].id); 
    $('#saveChangesBtn').data('project-id', projectId);
});


$('#saveChangesBtn').on('click', function () {  
    const projectId = $(this).data('project-id');
    const todoId = $(this).data('todo-id');
    // const endDate = $('#editEndDate').val(); 
    const content = $('#edit-todo-content').val();
    console.log("Save Changes", content);

    const endDate = $('#edit-date').val();
    
    // const endDate = new Date($('#edit-date').val()).toISOString();

    const dataString = `_method=patch&authenticity_token=BAhbB0kiAbB7ImNsaWVudF9pZCI6ImQ0NmY0NDgyY2UyNDRjNGEwNzYxYjA4ZTU3NzYxODJmYTlkMWM1Y2IiLCJleHBpcmVzX2F0IjoiMjAyNC0wNC0yOVQwODowOTozNVoiLCJ1c2VyX2lkcyI6WzQ4NjU5NjYwXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiYjZlYmU2NDA4NzdlMGE3NjA0YzAxYTMzNTgyOWIzMzQifQY6BkVUSXU6CVRpbWUNqA8fwD0APiYJOg1uYW5vX251bWkXOg1uYW5vX2RlbmkGOg1zdWJtaWNybyIHAYA6CXpvbmVJIghVVEMGOwBG--33a3da6ff42efe99938a00072b831e2515afdddc&todo[content]=${encodeURIComponent(content)}&todo[due_on]=${endDate}&date=${endDate}&commit=Save+changes`;
    console.log("datastring: " ,dataString);
   
    $.ajax({
        url: `/5689409/buckets/${projectId}/todos/${todoId}`,
        type: 'POST',
        contentType: 'application/x-www-form-urlencoded',
        data: dataString,
        success: function (response) {
            $('#loading-indicator').hide();

            // Display success message
            alert("Changes saved successfully!");

            // Clear and reload the DataTable
            const dataTable = $('#dataTable').DataTable();
            dataTable.clear().draw(); // Clear existing data
            dataTable.ajax.reload(null, false);  // Reload data without resetting pagination

            // Optionally, clear the form or reset fields
            $('#edit-todo-content').val('');
            $('#edit-date').val('');
            $('#editModal').modal('hide'); 

        },
        error: function (error) {
            $('#loading-indicator').hide();
            alert("error!");
            console.error('Error updating todo:', error);
            console.error('Server-side error:', error.responseText);
        }
    });
});
// Add click event listener to toggle content visibility
$(document).on('click', '.caret', function () {
    $(this).toggleClass('caret-down').siblings('ul').toggle();
});


// Function to complete a todo using server-side API
function completeTodoOnServer(projectId, todoId) {
    $.ajax({
        url: `/completeTodo/${projectId}/${todoId}`, 
        type: 'POST',
        success: function (response) {
            console.log(`Todo with ID ${todoId} marked as completed on the server.`);
        },
        error: function (error) {
            console.error('Error completing todo on server:', error);
        }
    });
}

// Function to uncomplete a todo using server-side API
function uncompleteTodoOnServer(projectId, todoId) {
    $.ajax({
        url: `/uncompleteTodo/${projectId}/${todoId}`,
        type: 'DELETE',
        success: function (response) {
            console.log(`Todo with ID ${todoId} marked as uncompleted on the server.`);
        },
        error: function (error) {
            console.error('Error uncompleting todo on server:', error);
        }
    });
}


// Event listener for checkbox change
$(document).on('change', '.todo-checkbox', function () {
    const todoId = $(this).data('todoId');
    const projectId = $(this).data('projectId');
    console.log("Check", todoId, projectId);
    if (this.checked) {
        completeTodoOnServer(projectId, todoId);
    } else {
        uncompleteTodoOnServer(projectId, todoId);
    }
});


var toggler = document.getElementsByClassName("caret");
var i;

for (i = 0; i < toggler.length; i++) {
    toggler[i].addEventListener("click", function () {
        this.parentElement.querySelector(".nested").classList.toggle("active");
        this.classList.toggle("caret-down");
    });
}

// Activity logs
function openLogs(){
    window.open('/logs', '_blank');
}


$(document).ready(function () {
    var table;

    $('#exportExcelButton').on('click', function () {
        exportTableToExcel();
    });

    // function exportTableToExcel() {
    //     // Check if DataTable is initialized and has data
    //     if (table && table.rows().count() > 0) {
    //         var allData = [];
    //         var columnHeadings = [
    //             "Project Name",
    //             "Description",
    //             "PM Name",
    //             "Critical",
    //             "Prerequisite",
    //             "Installation",
    //             "Handover and \nCommissioning",
    //             "Handover Date",
    //             "Handover \nInstallation Date"
    //         ];
    //         allData.push(columnHeadings); 
    //         table.rows().every(function () {
    //             var rowData = [];
    //             $(this.node()).find('td').each(function (index) {
    //                 // Exclude the first column (index 0) and "Update" content
    //                 if (index > 0) {
    //                     const cellText = $(this).text().trim();
    //                     if (cellText !== "Update") {
    //                         rowData.push(cellText);
    //                     }
    //                 }
    //             });
    //             allData.push(rowData);
    //         });

    //         // Use exceljs to create workbook
    //         var workbook = new ExcelJS.Workbook();
    //         var worksheet = workbook.addWorksheet('Data');

    //         // Add a custom title row
    //         const titleRow = worksheet.addRow(['BuildTrack Project Sheet']);
    //         titleRow.eachCell((cell) => {
    //             cell.font = { size: 36, bold: true };
    //             cell.alignment = { horizontal: 'center', vertical: 'middle' };
    //         });
    //         worksheet.mergeCells(`A1:${String.fromCharCode(65 + columnHeadings.length - 1)}1`); 

    //         // Add column headings
    //         var headerRow = worksheet.addRow(columnHeadings);

    //         // Apply bold style to header row
    //         headerRow.eachCell((cell) => {
    //             cell.font = { size: 12, bold: true };
    //             cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; 
    //         });

    //         // Add data rows with text wrapping
    //         allData.slice(1).forEach(row => {
    //             const dataRow = worksheet.addRow(row);
    //             dataRow.eachCell((cell) => {
    //                 cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' }; 
    //             });
    //         });

    //         // Adjust column widths
    //         worksheet.columns = columnHeadings.map((heading, index) => {
    //             const maxLength = Math.max(
    //                 heading.length, // Header length
    //                 ...allData.map(row => (row[index] ? row[index].length : 0)) 
    //             );
    //             return { width: Math.min(maxLength + 5, 30) }; 
    //         });

    //         // Generate and download the Excel file
    //         workbook.xlsx.writeBuffer().then(function (buffer) {
    //             saveAs(new Blob([buffer], { type: "application/octet-stream" }), 'projects.xlsx');
    //         }).catch(function (error) {
    //             console.error('Error writing Excel file:', error);
    //         });
    //     } else {
    //         console.error("DataTable is not initialized or has no data.");
    //     }
    // }
    // function exportTableToExcel() {
    //     var userEmail = localStorage.getItem('userEmail'); // Ensure 'userEmail' is set in localStorage
    //     if (!userEmail) {
    //         console.error('User email not found in localStorage.');
    //         return;
    //     }
    
    //     // Create and show the popup
    //     function showDownloadPopup() {
    //         const popup = document.createElement('div');
    //         popup.id = 'download-popup';
    //         popup.style.position = 'fixed';
    //         popup.style.top = '50%';
    //         popup.style.left = '50%';
    //         popup.style.transform = 'translate(-50%, -50%)';
    //         popup.style.padding = '20px';
    //         popup.style.backgroundColor = '#fff';
    //         popup.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    //         popup.style.borderRadius = '8px';
    //         popup.style.textAlign = 'center';
    //         popup.style.zIndex = '1000';
    
    //         popup.innerHTML = `
    //             <div id="popup-content">
    //                 <p>Downloading...</p>
    //                 <div id="spinner" style="margin: 10px auto; width: 40px; height: 40px; border: 4px solid #ccc; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
    //             </div>
    //         `;
    
    //         document.body.appendChild(popup);
    
    //         const style = document.createElement('style');
    //         style.innerHTML = `
    //             @keyframes spin {
    //                 from { transform: rotate(0deg); }
    //                 to { transform: rotate(360deg); }
    //             }
    //         `;
    //         document.head.appendChild(style);
    //     }
    
    //     // Close the popup and show a tick
    //     function closeDownloadPopup() {
    //         const popup = document.getElementById('download-popup');
    //         if (popup) {
    //             const content = document.getElementById('popup-content');
    //             content.innerHTML = `
    //                 <p>Download Complete</p>
    //                 <div style="margin: 10px auto; width: 40px; height: 40px; border-radius: 50%; background-color: #28a745; display: flex; justify-content: center; align-items: center;">
    //                     <span style="color: #fff; font-size: 24px;">✔</span>
    //                 </div>
    //             `;
    
    //             setTimeout(() => {
    //                 popup.remove();
    //             }, 2000); // Remove popup after 2 seconds
    //         }
    //     }
    
    //     var allData = [];
    //     var columnHeadings = [
    //         "Project Name",
    //         "Description",
    //         "PM Name",
    //         "Critical",
    //         "Prerequisite",
    //         "Installation",
    //         "Handover and \nCommissioning",
    //         "Handover Date",
    //         "Handover \nInstallation Date"
    //     ];
    
    //     allData.push(columnHeadings);
    
    //     // Function to recursively fetch all pages of data
    //     async function fetchAllProjects(page = 0) {
    //         try {
    //             const response = await $.ajax({
    //                 url: '/projects', // Adjust the endpoint to fetch all data
    //                 method: 'POST',
    //                 contentType: 'application/json',
    //                 data: JSON.stringify({
    //                     start: page * 10, // Start index for the current page
    //                     length: 10,      // Limit to 10 records per page
    //                     search: null,    // No filtering applied
    //                     email: userEmail
    //                 })
    //             });
    
    //             // Process the data from the current page
    //             response.data.forEach(project => {
    //                 const allTodos = project.allTodos || [];
    //                 const filteredTodos = project.filteredTodos || [];
    //                 const filteredHardwareContent = project.filteredHardwareContent || [];
    //                 const startDates = allTodos.map(todo => todo.starts_on || 'N/A').join(', ');
    //                 const dueDates = allTodos.map(todo => todo.due_on || 'N/A').join(', ');
    //                 const filteredTodosDueDate = filteredTodos.map(todo => todo.due_on || 'N/A').join(', ');
    //                 const filteredHardwareUpdatedAt = filteredHardwareContent.map(hardware => hardware.updated_at || 'N/A').join(', ');
    
    //                 const creatorName = allTodos.length > 0 && allTodos[0].creator ? allTodos[0].creator.name : 'N/A';
    //                 const criticalStatus = project.todolistCompletionCounts?.['Critical  ']?.status || 'N/A';
    //                 const preRequisitesStatus = project.todolistCompletionCounts?.['Pre-Requisites']?.status || 'N/A';
    //                 const installationStatus = project.todolistCompletionCounts?.['Installation']?.status || 'N/A';
    //                 const handoverStatus = project.todolistCompletionCounts?.['Handover and Commissioning']?.status || 'N/A';
    
    //                 allData.push([
    //                     project.name,
    //                     project.description,
    //                     creatorName,
    //                     criticalStatus,
    //                     preRequisitesStatus,
    //                     installationStatus,
    //                     handoverStatus,
    //                     filteredTodosDueDate,
    //                     filteredHardwareUpdatedAt
    //                 ]);
    //             });
    
    //             // If more pages exist, fetch the next page
    //             if (response.data.length > 0) {
    //                 await fetchAllProjects(page + 1);
    //             } else {
    //                 // Once all data is fetched, generate the Excel file
    //                 generateExcel();
    //             }
    //         } catch (error) {
    //             console.error('Error fetching all data:', error);
    //         }
    //     }
    
    //     // Function to generate the Excel file after fetching all data
    //     function generateExcel() {
    //         var workbook = new ExcelJS.Workbook();
    //         var worksheet = workbook.addWorksheet('Data');
    
    //         // Add a custom title row
    //         const titleRow = worksheet.addRow(['BuildTrack Project Sheet']);
    //         titleRow.eachCell((cell) => {
    //             cell.font = { size: 36, bold: true };
    //             cell.alignment = { horizontal: 'center', vertical: 'middle' };
    //         });
    //         worksheet.mergeCells(`A1:${String.fromCharCode(65 + columnHeadings.length - 1)}1`);
    
    //         // Add column headings
    //         var headerRow = worksheet.addRow(columnHeadings);
    //         headerRow.eachCell((cell) => {
    //             cell.font = { size: 12, bold: true };
    //             cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    //         });
    
    //         // Add data rows with text wrapping
    //         allData.slice(1).forEach(row => {
    //             const dataRow = worksheet.addRow(row);
    //             dataRow.eachCell((cell) => {
    //                 cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    //             });
    //         });
    
    //         // Adjust column widths
    //         worksheet.columns = columnHeadings.map((heading, index) => {
    //             const maxLength = Math.max(
    //                 heading.length,
    //                 ...allData.map(row => (row[index] ? row[index].length : 0))
    //             );
    //             return { width: Math.min(maxLength + 5, 30) };
    //         });
    
    //         // Generate and download the Excel file
    //         workbook.xlsx.writeBuffer().then(function (buffer) {
    //             saveAs(new Blob([buffer], { type: "application/octet-stream" }), 'projects.xlsx');
    //             closeDownloadPopup(); // Close the popup after download
    //         }).catch(function (error) {
    //             console.error('Error writing Excel file:', error);
    //         });
    //     }
    
    //     // Show the popup and start fetching data
    //     showDownloadPopup();
    //     fetchAllProjects();
    // }
    
    function exportTableToExcel() {
        const userEmail = localStorage.getItem('userEmail');
        if (!userEmail) {
            console.error('User email not found in localStorage.');
            return;
        }
    
        // Create and show the popup
        showDownloadPopup();
    
        // Make an AJAX call to fetch all projects (using the /projects/all endpoint)
        $.ajax({
            url: '/projects/all',
            type: 'GET',
            data: { email: userEmail },
            success: function(response) {
                console.log("Projects loaded from server:", response);
                if (response && Array.isArray(response) && response.length > 0) {
                    // Build the data array for Excel export
                    const allData = [];
                    const columnHeadings = [
                        "Project Name",
                        "Description",
                        "PM Name",
                        "Critical",
                        "Prerequisite",
                        "Installation",
                        "Handover and \nCommissioning",
                        "Handover Date",
                        "Handover \nInstallation Date"
                    ];
                    // Add the headings as the first row
                    allData.push(columnHeadings);
    
                    response.forEach(project => {
                        const allTodos = project.allTodos || [];
                        const filteredTodos = project.filteredTodos || [];
                        const filteredHardwareContent = project.filteredHardwareContent || [];
                        const filteredTodosDueDate = filteredTodos.map(todo => todo.due_on || 'N/A').join(', ');
                        const filteredHardwareUpdatedAt = filteredHardwareContent.map(hardware => hardware.updated_at || 'N/A').join(', ');
                        
                        // Get the creator name if available
                        const creatorName = (allTodos.length > 0 && allTodos[0].creator)
                            ? allTodos[0].creator.name
                            : 'N/A';
                        // Get status values from the project object (using optional chaining for safety)
                        const criticalStatus = project.todolistCompletionCounts?.['Critical  ']?.status || 'N/A';
                        const preRequisitesStatus = project.todolistCompletionCounts?.['Pre-Requisites']?.status || 'N/A';
                        const installationStatus = project.todolistCompletionCounts?.['Installation']?.status || 'N/A';
                        const handoverStatus = project.todolistCompletionCounts?.['Handover and Commissioning']?.status || 'N/A';
                        
                        // Push the processed row into our data array
                        allData.push([
                            project.name,
                            project.description,
                            creatorName,
                            criticalStatus,
                            preRequisitesStatus,
                            installationStatus,
                            handoverStatus,
                            filteredTodosDueDate,
                            filteredHardwareUpdatedAt
                        ]);
                    });
    
                    // Generate and download the Excel file
                    generateExcel(allData, columnHeadings);
                } else {
                    console.error("No valid data received.");
                    closeDownloadPopup();
                }
            },
            error: function(error) {
                console.error('Error loading projects:', error);
                closeDownloadPopup();
            }
        });
    }
    
    // Popup functions
    function showDownloadPopup() {
        const popup = document.createElement('div');
        popup.id = 'download-popup';
        popup.style.position = 'fixed';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.padding = '20px';
        popup.style.backgroundColor = '#fff';
        popup.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        popup.style.borderRadius = '8px';
        popup.style.textAlign = 'center';
        popup.style.zIndex = '1000';
    
        popup.innerHTML = `
            <div id="popup-content">
                <p>Downloading...</p>
                <div id="spinner" style="margin: 10px auto; width: 40px; height: 40px; border: 4px solid #ccc; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            </div>
        `;
        document.body.appendChild(popup);
    
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }
    
    function closeDownloadPopup() {
        const popup = document.getElementById('download-popup');
        if (popup) {
            const content = document.getElementById('popup-content');
            content.innerHTML = `
                <p>Download Complete</p>
                <div style="margin: 10px auto; width: 40px; height: 40px; border-radius: 50%; background-color: #28a745; display: flex; justify-content: center; align-items: center;">
                    <span style="color: #fff; font-size: 24px;">✔</span>
                </div>
            `;
            setTimeout(() => {
                popup.remove();
            }, 2000);
        }
    }
    
    // Function to generate the Excel file using ExcelJS
    function generateExcel(allData, columnHeadings) {
        var workbook = new ExcelJS.Workbook();
        var worksheet = workbook.addWorksheet('Data');
    
        // Add a custom title row
        const titleRow = worksheet.addRow(['BuildTrack Project Sheet']);
        titleRow.eachCell((cell) => {
            cell.font = { size: 36, bold: true };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });
        // Merge cells for the title across all columns (e.g., A1:I1)
        worksheet.mergeCells(`A1:${String.fromCharCode(65 + columnHeadings.length - 1)}1`);
    
        // Add the header row
        var headerRow = worksheet.addRow(columnHeadings);
        headerRow.eachCell((cell) => {
            cell.font = { size: 12, bold: true };
            cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
        });
    
        // Add the rest of the data rows
        allData.slice(1).forEach(row => {
            const dataRow = worksheet.addRow(row);
            dataRow.eachCell((cell) => {
                cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
            });
        });
    
        // Adjust column widths based on maximum content length
        worksheet.columns = columnHeadings.map((heading, index) => {
            const maxLength = Math.max(
                heading.length,
                ...allData.map(row => (row[index] ? row[index].toString().length : 0))
            );
            return { width: Math.min(maxLength + 5, 30) };
        });
    
        // Generate and download the Excel file
        workbook.xlsx.writeBuffer().then(function (buffer) {
            saveAs(new Blob([buffer], { type: "application/octet-stream" }), 'projects.xlsx');
            closeDownloadPopup();
        }).catch(function (error) {
            console.error('Error writing Excel file:', error);
            closeDownloadPopup();
        });
    }
    
    
    // Initialize DataTable only if it's not initialized already
    if (!$.fn.DataTable.isDataTable('#dataTable')) {
        table = $('#dataTable').DataTable({
            "paging": true
        });
    } else {
        table = $('#dataTable').DataTable();
    }
});



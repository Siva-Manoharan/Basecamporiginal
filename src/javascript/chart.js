$(document).ready(function () {
    $('#todosTable').DataTable();
    $('.edit-btn').on('click', function () {
        const projectId = $(this).data('project-id');
        const assignedNames = $(this).data('assigned').split(',');
        const $this = $(this);

        $.ajax({
            url: `/people/${projectId}`,
            type: 'GET',
            success: function (people) {
                // Populate the assignees dropdown with the fetched people
                assigneesDropdown = new Choices('#editAssignedDrop', {
                    removeItemButton: true,
                    searchEnabled: true,
                    multiple: true,
                    choices: people.map(person => ({ value: person.id, label: person.name })),
                });
                const assignedData = $this.data('assigned');
                console.log('Assigned data from $this:', assignedData);

                if (assignedData) {
                    const assignedNames = assignedData.split(',').map(assignee => {
                        const [id, name] = (assignee || '').split(':');
                        return { value: id ? id.trim() : '', label: name ? name.trim() : '' };
                    });
                    console.log('Assigned names to set:', assignedNames);

                    // Use setValue to set selected values (names) in the dropdown
                    assigneesDropdown.setValue(assignedNames);
                }

            },
            error: function (error) {
                console.error('Error fetching people:', error);
            },
        });

        $('#editProject').val($(this).data('project'));
        $('#editTodoGroup').val($(this).data('todo-group'));
        $('#editTodo').val($(this).data('todo'));
        $('#editAssigned').val($(this).data('assigned'));
        $('#editStart-date').val($(this).data('start-date'));
        $('#editEndDate').val($(this).data('end-date'));
        $('#editDueDate').val($(this).data('due-date'));
        $('#nodueDate').val($(this).data('no-date'));
        $('#editStatus').val($(this).data('status'));
        $('#saveChangesBtn').data('todo-id', $(this).data('todo-id'));
        $('#saveChangesBtn').data('assignees-id', $(this).data('assignees'));
        $('#saveChangesBtn').data('project-id', projectId);

        // Show the modal
        $('#editModal').modal('show');
    });
    $('#saveChangesBtn').on('click', function () {
        const projectId = $(this).data('project-id');
        const todoId = $(this).data('todo-id');
        console.log("todoId: " + todoId);
        //const assignees = $(this).data('assignees-id');
        const assigned = $('#editAssigned').val();
        const startDate = $('#editStart-date').val();
        const endDate = $('#editEndDate').val();
        const dueDate = $('#editDueDate').val();
        const nodate = $("#nodueDate").val();


        const status = $('#editStatus').val();

        const todoContent = $('#editTodo').val();

        const currentAssignees = $(this).data('assignees-id') || [];

        // Get selected assignees from the Choices.js dropdown
        const selectedAssignees = assigneesDropdown.getValue(true).map(id => Number(id));
        console.log('Selected Assignees:', selectedAssignees);

        // Combine current and selected assignees
        const updatedAssignees = [...currentAssignees, ...selectedAssignees];

        // Convert assignees to a string for the dataString
        const assigneesString = JSON.stringify(updatedAssignees);

        let dataString = `_method=patch&authenticity_token= BAhbB0kiAbB7ImNsaWVudF9pZCI6ImQ0NmY0NDgyY2UyNDRjNGEwNzYxYjA4ZTU3NzYxODJmYTlkMWM1Y2IiLCJleHBpcmVzX2F0IjoiMjAyNC0wMy0wNVQwNzo1Nzo1N1oiLCJ1c2VyX2lkcyI6WzQ4NjU5NjYwXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiYjZlYmU2NDA4NzdlMGE3NjA0YzAxYTMzNTgyOWIzMzQifQY6BkVUSXU6CVRpbWUNpwgfwM49n+cJOg1uYW5vX251bWkCJwM6DW5hbm9fZGVuaQY6DXN1Ym1pY3JvIgeAcDoJem9uZUkiCFVUQwY7AEY=--5cddc3a9858bb13da893f541971c35cef0becd0a&replace=true&todo[content]=${encodeURIComponent(
            todoContent
        )}&todo[assignees]=${assigneesString}&todo[completion_subscribers]=&todo[scheduling]=on&todo[starts_on]=${startDate}`;

        if (document.getElementById('due-date')) {
            // Get the selected value
            var selectedValue = document.getElementById('due-date').value;

            if (selectedValue === 'specific-day') {
                dataString += `&todo[due_on]=${dueDate}`;
                dataString += `&date=${endDate}`;
                dataString += `&todo[starts_on]=${dueDate}`;
            } else if (selectedValue === 'date-range') {
                dataString += `&todo[due_on]=${endDate}`;
                dataString += `&date=${endDate}`;
            } else if (selectedValue === 'no-due-date') {
                // Do nothing for 'No Due Date' option
            } else {
                dataString += `&todo[due_on]=${endDate}`;
                dataString += `&date=${endDate}`;
            }
        }

        dataString += `&todo[description]=&commit=Save+changes`;


        console.log("Data string: ", dataString);

        // update the data in todo and due date 
        $.ajax({
            url: `/5740649/buckets/${projectId}/todos/${todoId}`,
            type: 'POST',
            contentType: 'application/x-www-form-urlencoded',
            data: dataString,
            success: function (response) {
                $('#loading-indicator').show();
                alert("success!");
                location.reload();
                console.log('Todo updated successfully:', response);
            },
            error: function (error) {
                $('#loading-indicator').hide();
                alert("error!");
                console.error('Error updating todo:', error);
                console.error('Server-side error:', error.responseText);
            }
        });
    });


    $('#editModal').on('hidden.bs.modal', function () {
        // Destroy the Choices.js instance when the modal is hidden
        if (assigneesDropdown) {
            assigneesDropdown.destroy();
        }
    });
    // delete the data in todo and due date entire row
    $('.delete-btn').on('click', function () {
        const projectId = $(this).data('project-id');
        const todoId = $(this).data('todo-id');
        const assignees = $(this).data('assignees-id');
        const assigned = $('#editAssigned').val();
        const dueDate = $('#editDueDate').val();
        const status = $('#editStatus').val();
        const todoContent = $('#editTodo').val();
        const $button = $(this);

        // Display a confirmation dialog
        const isConfirmed = window.confirm('Are you sure you want to delete this todo?');

        if (isConfirmed) {
            const dataString = `_method=patch&authenticity_token=...&replace=true&todo[content]=${encodeURIComponent(
                todoContent
            )}&todo[assignees]=${assignees}&todo[completion_subscribers]=&todo[scheduling]=on&todo[due_on]=${dueDate}&date=${dueDate}&date=&date=&todo[description]=&commit=Save+changes`;

            $.ajax({
                url: `/5740649/buckets/${projectId}/todos/${todoId}`,
                type: 'PUT',
                contentType: 'application/x-www-form-urlencoded',
                data: dataString,
                success: function (response) {
                    alert("Todo deleted successfully!");
                    $button.closest('tr').remove();
                },
                error: function (error) {
                    alert("Error deleting todo!");
                    console.error('Error deleting todo:', error);
                }
            });
        } else {
            // User clicked "Cancel" in the confirmation dialog
            alert("Todo deletion canceled.");
        }
    });


});


document.getElementById('due-date').addEventListener('change', function () {
    // Get the selected value
    var selectedValue = this.value;

    // Show/hide the date pickers based on the selected option
    document.getElementById('specific-day-picker').style.display = selectedValue === 'specific-day' ? 'block' : 'none';
    document.getElementById('date-range-picker').style.display = selectedValue === 'date-range' ? 'block' : 'none';

    // Set the value of #editDueDate based on the selected due date
    var editDueDate = document.getElementById('editDueDate');
    var editStartDate = document.getElementById('editStart-date');

    if (selectedValue === 'specific-day') {
        var specificDayValue = document.getElementById('specific-day-picker').value;
        console.log('Specific Day Value:', specificDayValue);
        editDueDate.value = specificDayValue;
        editStartDate.value = specificDayValue;
    } else if (selectedValue === 'date-range') {
        var dateRangeValue = document.getElementById('date-range-picker').value;
        console.log('Date Range Value:', dateRangeValue);
        editDueDate.value = dateRangeValue;
        editStartDate.value = dateRangeValue;
    } else if (selectedValue === 'no-due-date') {
        console.log('No Due Date Selected');
        // Clear values when 'No Due Date' is selected
        editDueDate.value = '';
        editStartDate.value = '';
    } else {
        console.log('Other Option Selected');
        editDueDate.value = '';
        editStartDate.value = '';
    }
});
const projectsButton = document.getElementById('projectsButton');

// Add a click event listener to the button
projectsButton.addEventListener('click', () => {
    window.location.href = '/projects';
});


// Function to handle logout
function handleLogout() {
    const isConfirmed = confirm('Are you sure you want to logout?');
    if (isConfirmed) {
        window.location.href = '/';
    }
}

// Attach the handleLogout function to the click event of the logout button
document.getElementById('logoutButton').addEventListener('click', handleLogout);

//folder
function toggleFolders(clickedElement) {
    var parentLi = clickedElement.parentElement;
    var nestedUl = parentLi.querySelector(".nested");

    // Toggle the display property of the nested <ul> element
    if (nestedUl) {
        nestedUl.style.display = (nestedUl.style.display === "none") ? "block" : "none";
    }
}


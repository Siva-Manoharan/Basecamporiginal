const express = require('express');
const axios = require('axios');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { authenticate, handleCallback } = require('./auth');
const app = express();
const port = process.env.PORT || 3000;
require('dotenv').config();
app.use(express.json());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
const session = require('express-session');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');

app.use(session({
  secret: process.env.AUTHENTICITY_TOKEN,
  resave: false,
  saveUninitialized: true,
}));

app.use(cors({
  origin: 'https://3.basecamp.com',
  credentials: true,
}));

const axiosConfig = {
  headers: JSON.parse(process.env.BASECAMP_HEADERS || '{}'),
};

const authenticityToken = process.env.AUTHENTICITY_TOKEN;
const basecampApiUrl = process.env.BASECAMP_API_URL || '';

app.use('/src/css', express.static('src/css', {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

//js
app.use('/src/javascript', express.static('src/javascript', {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// OAuth 2.0 Authorization
app.get('/auth', async (req, res) => {
  try {
    const authUrl = await authenticate();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Error during authentication:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const result = await handleCallback(code);
    res.send(result);
  } catch (error) {
    console.error('Error during callback handling:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// get the index page 
// app.get('/', async (req, res) => {
//   res.render('index.ejs');
// });
function findNextLink(linkHeader) {
  if (!linkHeader) return null;
  const links = linkHeader.split(", ");
  for (const link of links) {
    const [url, rel] = link.split("; ");
    if (rel.includes("next")) {
      return url.slice(1, -1); 
    }
  }
  return null;
}

// Fetch all projects with pagination
const fetchProjects = async () => {
  let allProjects = [];
  let nextPage = `${basecampApiUrl}/projects.json`;

  while (nextPage) {
    try {
      const response = await axios.get(nextPage, axiosConfig);
      allProjects = allProjects.concat(response.data);
      nextPage = findNextLink(response.headers.link); 
    } catch (error) {
      console.error("Error fetching projects:", error.message);
      break; 
    }
  }
  return allProjects;
};

// Fetch project details
const fetchProjectDetails = async (projectId) => {
  try {
    const projectDataResponse = await axios.get(`${basecampApiUrl}/buckets/${projectId}.json`, axiosConfig);
    const projectData = projectDataResponse.data;

    // Get all todosets in parallel
    const todosets = projectData.dock?.filter(item => item.name === "todoset") || [];

    const todosetPromises = todosets.map(async (todoset) => {
      const todolistResponse = await axios.get(`${basecampApiUrl}/buckets/${projectId}/todosets/${todoset.id}/todolists.json`, axiosConfig);
      const todolists = todolistResponse.data;

      // Fetch todos for each todolist in parallel
      const todoPromises = todolists.map(async (todolist) => {
        const [completedTodos, uncompletedTodos] = await Promise.all([
          axios.get(`${basecampApiUrl}/buckets/${projectId}/todolists/${todolist.id}/todos.json`, {
            ...axiosConfig,
            params: { completed: true },
          }),
          axios.get(`${basecampApiUrl}/buckets/${projectId}/todolists/${todolist.id}/todos.json`, {
            ...axiosConfig,
            params: { completed: false },
          }),
        ]);

        return {
          todolistName: todolist.title,
          todos: [...completedTodos.data, ...uncompletedTodos.data],
          completionStatus: {
            status: `${completedTodos.data.length}/${completedTodos.data.length + uncompletedTodos.data.length}`,
          },
        };
      });

      return Promise.all(todoPromises);
    });

    // Wait for all todoset data to resolve
    const todosetData = (await Promise.all(todosetPromises)).flat();

    const allTodos = [];
    const todolistCompletionCounts = {};
    const filteredTodos = [];
    const filteredHardwareContent = [];

    // Process all todos and calculate completion counts
    todosetData.forEach(({ todolistName, todos, completionStatus }) => {
      allTodos.push(...todos);
      todolistCompletionCounts[todolistName] = completionStatus;
    });

    // Filter todos for specific content
    allTodos.forEach((todo) => {
      const contentLower = todo.content.toLowerCase();

      if (contentLower.includes("commissioning,demo & handover") || contentLower.includes("demo & handover")) {
        filteredTodos.push({ starts_on: todo.starts_on, due_on: todo.due_on });
      }

      if (todo.completed && (contentLower.includes("installation") || contentLower.includes("hardware"))) {
        const updatedDate = new Date(todo.updated_at).toISOString().split("T")[0];
        filteredHardwareContent.push({ starts_on: todo.starts_on, due_on: todo.due_on, updated_at: updatedDate });
      }
    });

    return { allTodos, todolistCompletionCounts, filteredTodos, filteredHardwareContent };
  } catch (error) {
    console.error(`Error fetching project details for project ${projectId}:`, error.message);
    return { allTodos: [], todolistCompletionCounts: {}, filteredTodos: [], filteredHardwareContent: [] };
  }
};

// Fetch project details in batches
const fetchProjectDetailsInBatches = async (projects, batchSize = 5) => {
  const userProjects = [];
  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = projects.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (project) => {
        try {
          const details = await fetchProjectDetails(project.id);
          userProjects.push({ ...project, ...details });
        } catch (error) {
          console.error(`Error fetching project details for ${project.id}:`, error.message);
        }
      })
    );
  }
  return userProjects;
};

// // Routes
// app.get("/projects", async (req, res) => {
//   try {
//     const userProjects = req.session.userProjects || [];
//     const projectsWithDetails = await fetchProjectDetailsInBatches(userProjects);
//     res.render("projects", { userProjects: projectsWithDetails });
//   } catch (error) {
//     console.error("Error fetching projects:", error.message);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/projects', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'projects.html'));
});


app.post('/projects', async (req, res) => {
  try {
    const { start = 0, length = 10, search, columnSearch = [], email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required to fetch projects." });
    }

    // Fetch all projects
    const allProjects = await fetchProjects();
    const userProjects = [];

    await Promise.all(
      allProjects.map(async (project) => {
        try {
          const peopleUrl = `${basecampApiUrl}/projects/${project.id}/people.json`;
          const peopleResponse = await axios.get(peopleUrl, axiosConfig);
          const user = peopleResponse.data.find((u) => u.email_address === email);

          if (user) {
            userProjects.push(project);
          }
        } catch (error) {
          console.error(`Error fetching people for project ${project.id}:`, error.message);
        }
      })
    );

    // Apply global search filter
    let filteredProjects = userProjects;
    if (search?.value) {
      const searchValue = search.value.toLowerCase();
      filteredProjects = filteredProjects.filter(project =>
          project.name?.toLowerCase().includes(searchValue) || 
          project.description?.toLowerCase().includes(searchValue) 
      );
  }

    // Apply column-specific filters
    filteredProjects = filteredProjects.filter(project => {
      return columnSearch.every((searchValue, index) => {
        if (!searchValue) return true;

        switch (index) {
          case 0: return project.id.toString().includes(searchValue); // Column 0: ID
          case 1: return project.name?.toLowerCase().includes(searchValue.toLowerCase()); // Column 1: Name
          case 2: return project.description?.toLowerCase().includes(searchValue.toLowerCase()); // Column 2: Description
          case 3:   return project.details?.allTodos?.some(todo => todo.creator?.name?.toLowerCase().includes(searchValue.toLowerCase()) ?? false);
          default: return true; // Add more cases for additional columns
        }
      });
    });

    // Pagination
    const startIndex = parseInt(start, 10);
    const pageSize = parseInt(length, 10);
    const paginatedProjects = filteredProjects.slice(startIndex, startIndex + pageSize);

    // Fetch project details
    const projectsWithDetails = await Promise.all(
      paginatedProjects.map(async (project) => {
        try {
          const details = await fetchProjectDetails(project.id);
          return {
            id: project.id,
            name: project.name,
            description: project.description,
            allTodos: details.allTodos,
            todolistCompletionCounts: details.todolistCompletionCounts,
            filteredTodos: details.filteredTodos,
            filteredHardwareContent: details.filteredHardwareContent,
          };
        } catch (error) {
          console.error(`Error fetching details for project ${project.id}:`, error.message);
          return { id: project.id, name: project.name, description: project.description };
        }
      })
    );

    res.json({
      draw: req.body.draw,
      recordsTotal: userProjects.length,
      recordsFiltered: filteredProjects.length,
      data: projectsWithDetails,
    });
  } catch (error) {
    console.error("Error handling column search:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.get("/projects/all", async (req, res) => {
  try {
    const userEmail = req.query.email; // ✅ Get email from query parameters
    if (!userEmail) {
      return res.status(400).json({ error: "Email is required to fetch projects." });
    }

    const allProjects = await fetchProjects();
    const userProjects = [];

    await Promise.all(
      allProjects.map(async (project) => {
        try {
          const peopleUrl = `${basecampApiUrl}/projects/${project.id}/people.json`;
          const peopleResponse = await axios.get(peopleUrl, axiosConfig);
          const user = peopleResponse.data.find((u) => u.email_address === userEmail);

          if (user) {
            userProjects.push(project);
          }
        } catch (error) {
          console.error(`Error fetching people for project ${project.id}: ${error.message}`);
        }
      })
    );

    const projectsWithDetails = await fetchProjectDetailsInBatches(userProjects);

    res.json(projectsWithDetails);
  } catch (error) {
    console.error("Error fetching projects:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.get('/chart/:projectIds', async (req, res) => {
  try {
    const projectIds = req.params.projectIds.split(',');
    console.log(projectIds);
    
    const allTodos = [];
    const completedTodos = [];
    const uncompletedTodos = [];
    const uploadsData = [];
    const folderdatas = [];
    const childatas = [];
    const todolistCompletionCounts = {};
    const allFolderData = [];
    const allVaults = [];

    // Fetch project data in parallel
    const projectDataPromises = projectIds.map(projectId =>
      axios.get(`${basecampApiUrl}/buckets/${projectId}.json`, axiosConfig)
    );
    const projectDataResponses = await Promise.all(projectDataPromises);

    // Iterate over each project data
    for (let i = 0; i < projectDataResponses.length; i++) {
      const projectDataResponse = projectDataResponses[i];
      const projectId = projectIds[i]; 
      const projectData = projectDataResponse.data;
      const todosets = projectData.dock?.filter(item => item.name === 'todoset') || [];
      // const vaultsets = projectData.dock?.filter(item => item.name === 'vault') || [];
      const primaryVaultId = projectData.dock?.find(item => item.name === 'vault')?.id;

      if (primaryVaultId) {
        const primaryVault = await fetchVaultData(primaryVaultId, projectId);
        allFolderData.push(primaryVault);
        await fetchNestedVaults(primaryVaultId, projectId, primaryVault.children);
      }

      // Fetch nested vaults recursively
      async function fetchNestedVaults(vaultId, projectId, folderData) {
        const nestedVaultsData = await axios.get(`${basecampApiUrl}/buckets/${projectId}/vaults/${vaultId}/vaults.json`, axiosConfig);
        for (const vault of nestedVaultsData.data) {
          const nestedFolder = await fetchVaultData(vault.id, projectId);
          folderData.push(nestedFolder);
          await fetchNestedVaults(vault.id, projectId, nestedFolder.children);
          await uploadFilesInFolder(nestedFolder);
        }
      }
      // Upload files in a folder recursively
      async function uploadFilesInFolder(folder, projectId) {
        if (folder.files && folder.files.length > 0) {
          const fileToUpload = folder.files[0]; 
          if (fileToUpload.path) { // Check if file.path is defined
            await uploadFile(projectId, fileToUpload); 
          } else {
            console.error(`Error uploading file: Path is undefined for ${fileToUpload.title}`);
          }
        }
        if (folder.children && folder.children.length > 0) {
          for (const childFolder of folder.children) {
            await uploadFilesInFolder(childFolder, projectId); 
          }
        }
      }


      // Upload a single file
      async function uploadFile(projectId, file) {
        try {
          // Read file contents
          const fileData = fs.readFileSync(file.path);

          const formData = new FormData();
          formData.append('file', fileData, { filename: file.title }); 

          const response = await axios.post('https://3.basecamp.com/5689409/buckets/36859139/vaults/7259776328/uploads/publish', formData, {
            headers: {
              ...formData.getHeaders(),
              'accept': 'text/html, application/xhtml+xml', 
              'accept-language': 'en-US,en;q=0.9', 
              'baggage': 'sentry-environment=production,sentry-release=5509f31a7f7a657d3f9c0604641a03753ea58b87,sentry-public_key=09933acc40334accb3dad9532c4ff60f,sentry-trace_id=1cc399012bed4d62bbf6696a20329d0c', 
              'cookie': '_csrf_token=xBrJvVuUUAOY9VgMk%2FbAKP4yFRPEeyW1sCKTHUvI%2Fs0AZf%2FsaO2inu9zvo%2BIjsETnZDTKvXG07vyMMCLZ8JFX4gTg1VGM6QUHDP4tjeA21GYpgXT3o2VI8xBHrbsQh%2F9sA1dMVMjfxlYuFQxTLEa6UdO8eIh%2FJFY3MTguwLNnj0c6Ot2yW%2FJ--Sc802CoK15bKWbW1--1NPNsCd7TeW9Ir%2BojnKt3w%3D%3D; authenticity_token=68Xrxxbgsj90gNbHM8TiqfnRyiQ9l5Uj1-jq5hvDfySx_EPxoUIwwWdz4APksGhai9rs5gDgnuMbn9yReORHog; _bc3_session=G%2FvD%2FEcyZzrDaMFwj%2BvZsEu5O5N7n7zn3vy3fsmjKSiRQF%2B8B6Tw%2FE0UmC9BYFNElJ9xK1pRCJ%2BgWH0pPTHQR4lz%2FVg%2FphtFvqtMKP3hdiFVSBoNHkYiWXt4hwWdi91jXvu5tYGisotOHGWTDlHD3Ba7%2FWaBUBo9x%2BvBUqFszKOgYd4mVrFIxPZnq%2Fr9p%2BIRyB6Chn%2FAZgyaCCtOa71xj%2BDdMv6eOQJYmuJJJG7LwwscQ9tp5O2NaKzqt5V6hNpV3lbi53qAcguQtoF%2BqArHy7bDTOWrmbmBOTIt9Q4z4UfmH05euhqLG4vAqKs7Z%2F6SC454WLb5HTxij5Xmh0zBN9FfH%2Bou1jLlV8TfKeIG5uzSKhrYsbHUvSAtbilw34X%2FQWYp%2F1K39w1MHzTi1rzTDzNKM8oSWcXoyLvIzatiyVyADglN0bVZ1V0Ob2snqGWo6nPTtyGG0qgs9Q8zA7t9HutB5inJA6Wf%2F%2FJqoMDG1ZW2GHU6dhS%2F1J1KRT1GvDztI6kpiaAHh0KG84HhWFVGy64sYdHbOcvlwna%2Fbbt8EWQdgTedI6AhNMaxpG9D9Q%3D%3D--WK7nBtfHZ93H3RUf--yD6qg%2BgtqtzWLP0Nj8vpEA%3D%3D; color_scheme=none; bc3_identity_id=eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBCSnhpaVFFPSIsImV4cCI6bnVsbCwicHVyIjoiY29va2llLmJjM19pZGVudGl0eV9pZCJ9fQ%3D%3D--f46231e6c29714e20e9b764aab37715353e69919; bc3_session_verification_token=933a9031af17cd851767; _bc3_session=1IN41bSTT9RQvOCbr2QfEkqlLPcqQ0xSIsZkqk0nz381Lg%2FMo0SQQUTgHfYyKB6UEMKqgavmYBbBa7AyJvQaTtcFd8g1xJn08YZuFgTTxUQVXpih%2B2irNONzhnw97wBdXgzlUqSOxlKj5TlRiPSOaBY21u4QE%2FdtqE4anF8DUUXvUnj8llGFUvK4jKAU%2BApjIxDwXi0RX%2B2iIjxY3%2FLJO7l4d3gHNftpWuYZzhyNZPkY9hmhMxMFrcm%2F83OFQgkZfWL6rJX3VDtMJFaK8SBV7Dd3IGUtJNvYjHf%2B5UIIKXjp2MNmd9bSCiduY1zNfYoUbjxbgkViIcJb3OVIM%2BqhOef4fY8B30SSLqIAZQDRSHa9Pr49yVxVuZqI9vs7J1LRQMgVqx5XbhJhmbqD4HdCzkfd2hgNwk5twk3MgmZkKwxw%2B%2FoGuwS0KSYDnwG86McoqycXt7iWd5Xto0XAimfzUCbHkQPGXMncTFgIYBv1k3bOFEpUBMOGj2NcKUvb7BYqXIv165uDEjOYoAMHCOlY%2BGVh6G6tE8tZEBVy5z4f1fgmMnib6H%2FV%2FV6y5jBdJyFo1u8TQV4geEeYoKFH4pWiWxWly%2F7e5RZvdlw42ZMJUdB5iT7anynP7kH5J7rAOyoTh0CUCzOVhSsrtzQCCaWlZhYkjQ%2B8b%2FcoW4W7PJwdtETB6anfjvfcbXBlnxsX9b1EM0A%3D--Rpz9bC6ZHRfENB6m--ahQAqzBwZm9WthPi7w339g%3D%3D; _launchpad_session=2MJjhULI1eq8Rep45966d1ZQw4YHOgbjBi5FV5yzbuiQpVhvsOXLLdeAYcTL0jphTWkasA94bwWD46PLukLl%2B%2FF2rQxMZudbzAhw8ezXphtpvuqpzPilyGhwAV7LXnc7wSNUXL9LXw6IWzA%2BMB69fnU6wpb7lr9j5EB%2BWvtkySkIrF4WbTFd80tklDhkk0%2Fxr%2F%2BqVJLWIYm062a%2FcxhLfT4X%2B6Q%2FiMr78ljT3cGeIZNOo%2BjP9jvwCmW9AAKAtpmRah2PS%2Bkal5fZcawYxv39NnknT5jPbdkGWmaMYhZvZ5GmpqA%2F9ZiX0nOIxXFUqgutH1zG%2BEK7HaCL63EYoJGmOcFAltj3TjrobP%2FPZEc%3D--mEts26MiKXxKae4b--EIDySMHvcwizrzvvylv%2FqA%3D%3D', 
              'if-none-match': 'W/"01268ed46a0b152248f590f8ca7ae08d"', 
              'priority': 'u=1, i', 
              'referer': 'https://3.basecamp.com/5689409/projects', 
              'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', 
              'sec-ch-ua-mobile': '?0', 
              'sec-ch-ua-platform': '"Windows"', 
              'sec-fetch-dest': 'empty', 
              'sec-fetch-mode': 'cors', 
              'sec-fetch-site': 'same-origin', 
              'sentry-trace': '1cc399012bed4d62bbf6696a20329d0c-9980c845035f6902', 
              'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 
              'x-sec-purpose': 'prefetch', 
              'x-turbo-request-id': '18d39854-81c3-47bc-bd94-7c8d62ec494c'
            },
          });
          console.log("Upload", response.data);
          console.log(`File uploaded successfully: ${file.title}`);
          // Handle response if needed
        } catch (error) {
          console.error(`Error uploading file ${file.title}:`, error.message);
        }
      }
      const rootFolder = {
        files: [
          { path: 'C:/Users/Admin/Downloads/dummy.pdf', title: 'dummy.pdf' },
          { path: 'C:/Users/Admin/Downloads/dummy.pdf', title: 'dummy.pdf' },

        ],
        children: [
          {
            files: [
              { path: 'C:/Users/Admin/Downloads/dummy.pdf', title: 'dummy.pdf' },
            ],
            children: [],
          },
        ],
      };

      // Start uploading files recursively from the root folder
      uploadFilesInFolder(rootFolder, projectId)
        .then(() => {
          console.log('File upload completed.');
        })
        .catch((error) => {
          console.error('File upload failed:', error);
        });

      async function fetchVaultData(vaultId, projectId) {
        const vaultData = await axios.get(`${basecampApiUrl}/buckets/${projectId}/vaults/${vaultId}.json`, axiosConfig);
        const filesData = await axios.get(`${vaultData.data.uploads_url}`, axiosConfig); // Fetch files using uploads_url
        console.log("Upload", filesData);

        // Construct public download URLs for each file
        const publicDownloadUrls = filesData.data.map(file => ({
          title: file.title,
          publicDownloadUrl: file.download_url,
          previewUrl : file.preview_url
        }));

        const vault = vaultData.data;
        vault.files = publicDownloadUrls;
        vault.children = [];
        return vault;
      }

      // Iterate over each todoset and fetch todos
      for (let j = 0; j < todosets.length; j++) {
        const todoset = todosets[j];
        const todosetId = todoset.id;
        const todolistData = await axios.get(`${basecampApiUrl}/buckets/${projectId}/todosets/${todosetId}/todolists.json`, axiosConfig);

        // Iterate over each todolist
        for (let k = 0; k < todolistData.data.length; k++) {
          const todolist = todolistData.data[k];
          const todolistId = todolist.id;

          // Fetch completed todos and uncompleted todos in parallel
          const completedTodosPromise = axios.get(`${basecampApiUrl}/buckets/${projectId}/todolists/${todolistId}/todos.json`, {
            ...axiosConfig,
            params: { completed: true },
          });

          const uncompletedTodosPromise = axios.get(`${basecampApiUrl}/buckets/${projectId}/todolists/${todolistId}/todos.json`, {
            ...axiosConfig,
            params: { completed: false },
          });

          const [completedTodosData, uncompletedTodosData] = await Promise.all([completedTodosPromise, uncompletedTodosPromise]);

          // Combine completed and uncompleted todos data
          completedTodos.push(...completedTodosData.data);
          uncompletedTodos.push(...uncompletedTodosData.data);
        }
      }
    }

    allTodos.push(...completedTodos, ...uncompletedTodos);
    const combinedData = {
      todos: allTodos,
      completedTodos: completedTodos,
      folders: allFolderData,
      additionalData: uncompletedTodos,
      todolistCompletionCounts: todolistCompletionCounts,
      upload: uploadsData,
      folder: folderdatas,
      child: childatas,
      vaults: allVaults
    };
    // console.log(JSON.stringify(combinedData.folders, null, 2));
    res.render('chart.ejs', combinedData);

  } catch (error) {
    console.error('Error fetching data:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/people/:projectId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    // console.log("Projectid: " + projectId);
    const apiUrl = `${basecampApiUrl}/projects/${projectId}/people.json`;
    const response = await axios.get(apiUrl, axiosConfig, {
    });
    const data = response.data;
    res.json(data);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// Update the todos 
app.post('/5689409/buckets/:projectId/todos/:todoId', async (req, res) => {
  const projectId = req.params.projectId;
  console.log("projectttttttttttttttttt",projectId);
  
  const todoId = req.params.todoId;
  console.log("tododddddddddddddddd",todoId);

  const todoContent = req.body.todo.content;
  console.log("todododododododod",todoContent);
  
  const assignees = req.body.todo.assignees;
  const dueDate = req.body.todo.due_on;
  const startDate = req.body.todo.starts_on;
  const endDate = req.body.todo.due_on;
  console.log("dateee: " + endDate);
  

  const updatePromises = [];
  const createUpdatePromise = (url, data) => {
    return axios.patch(url, data, {
      headers: {
        'accept': 'application/json', 
    'accept-language': 'en-US,en;q=0.9', 
    'baggage': 'sentry-environment=production,sentry-release=23acf17a2eada89b7dd28a078631f4367dfb100d,sentry-public_key=09933acc40334accb3dad9532c4ff60f,sentry-trace_id=bf08fcf67886465ebeb570f8404024cb,sentry-transaction=%2F%3Aid%2Fbuckets%2F%3Aid%2Ftodosets%2F%3Aid,sentry-sampled=false', 
    'cookie': '_csrf_token=xBrJvVuUUAOY9VgMk%2FbAKP4yFRPEeyW1sCKTHUvI%2Fs0AZf%2FsaO2inu9zvo%2BIjsETnZDTKvXG07vyMMCLZ8JFX4gTg1VGM6QUHDP4tjeA21GYpgXT3o2VI8xBHrbsQh%2F9sA1dMVMjfxlYuFQxTLEa6UdO8eIh%2FJFY3MTguwLNnj0c6Ot2yW%2FJ--Sc802CoK15bKWbW1--1NPNsCd7TeW9Ir%2BojnKt3w%3D%3D; authenticity_token=68Xrxxbgsj90gNbHM8TiqfnRyiQ9l5Uj1-jq5hvDfySx_EPxoUIwwWdz4APksGhai9rs5gDgnuMbn9yReORHog; _bc3_session=S48xWoaA%2FTLi5Mh3pVdDsKkRffsb2cKOqCXo9bz9R3rWMXFALJFFNpIW0CYb9p2L02%2FYsMOriEArr6fGzWWXI4Qfy%2FiM0W1wHXzU8kIW3%2FqqXPiw9ckPShtsQYb1clvNmGeFXI2qVKFCRcBCZwpy9JVeNg9yjyqnsd1zF3qaa3muP5yRV9QG8U%2BLxPcDrkeU5V3K9WA%2FqGx66H4W2CkEL18QbgSYKXM2VlYmzrGjhdf1XkObeJB%2BlyNXEejAmjj5no0zn6be5O749wJ6gDkbZElGEGHXxTu6amNTxuM%2BzzMxsxcFuElCuJnbOdx08k8lhDXTbkcXip3J8emgTBm9QTDq%2BO6INjAV9xymTVLrCsgCQBqo%2BO%2F4Yp%2FzKw%2Bm0mqBJOXH8CIGJLn2%2B7m4m5YcNiQRIZOTcVYHvVL0wY8ej3HFew7UWtz5vEJtS%2F0y05scSMEdRC1GS27Dx9UJbIRXw88o06VxeTnDwnUdUhqjqfTSs7VJzSgG2VTL%2F7wRoOKLZBYPMFCGmyIyCeXJxjOUKjiwavPs3wUZDDqjTp4keUaCelNtzOmg3f4GAQdoo7%2Fqzho%3D--ZUl1GpDuqEWvw3Hd--rDpli5GQY7P%2BqouphFh2Gg%3D%3D; color_scheme=none; bc3_identity_id=eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBCSnhpaVFFPSIsImV4cCI6bnVsbCwicHVyIjoiY29va2llLmJjM19pZGVudGl0eV9pZCJ9fQ%3D%3D--f46231e6c29714e20e9b764aab37715353e69919; bc3_session_verification_token=933a9031af17cd851767; _bc3_session=PWGaG63xze9spff07uA7DkvyZkpCe8dz52QE86zpXRuM8q8S8hO7kQyULFpRsoCiywV6u2m3s3aoSfguJ3qId6UNpyGIJVpStlyEfOvtstIMvJu%2BMOvp8LRDldlU17hwLYpzHFcQguvlBEhj7jy5JyOJmJ0ls0Y4Fzm8YQr0PFcZrF%2BfHThNvNJhOb%2FyYqXt6umjMDOHtPt9mpYQAXaVlwF3mP4tPNwsjfEbEbs5ByWsVJTmX%2F3S6svAZteVx0JjEtwaRXbI6HLjo2fQyQAPHViKhhMXs80NB0j0lr1V3Vh4BwjKKK3swZGv%2B6fbB9clUZ8GCsmHbLj6rj13qLYKSF0ul5pY6lFWDXhAWDMXVUvGZazh5%2BWjrrRfN0Drh6XXAKLAcw1LViM%2BLiJsvH5JmBUzK8e4MtpVPgnWgYYBF%2BKipbE4aYo8hPzed7EMYfyaymvKz6TfX6TEF0HlmLecHAYdQ6s1z5FIzFKP6CPCk2qSM%2F6UHu%2BrkncFfLyPoX2ZGRajnNqDldUwPfXBLwDDhYLLwOxoSvNIqI1aR42k78AW7AwiVhhDcNXwqwqZwhjqXpo%3D--dUHyD7%2F3aGS0cRPg--q2tbJqDJWLwoXe1aeIwlPw%3D%3D', 
    'if-none-match': 'W/"9d46f905ba914c46b307e4ee588ccb40"', 
    'priority': 'u=1, i', 
    'referer': 'https://3.basecamp.com/5689409/projects', 
    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"', 
    'sec-ch-ua-mobile': '?0', 
    'sec-ch-ua-platform': '"Windows"', 
    'sec-fetch-dest': 'empty', 
    'sec-fetch-mode': 'cors', 
    'sec-fetch-site': 'same-origin', 
    'sentry-trace': 'bf08fcf67886465ebeb570f8404024cb-aa22773b7de2da77-0', 
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36', 
    'x-csrf-token': '68Xrxxbgsj90gNbHM8TiqfnRyiQ9l5Uj1-jq5hvDfySx_EPxoUIwwWdz4APksGhai9rs5gDgnuMbn9yReORHog', 
    'x-fetch-type': 'native', 
    'x-requested-with': 'XMLHttpRequest'

      }
    });
  };

  const updateUrl = `https://3.basecamp.com/5689409/buckets/${projectId}/todos/${todoId}`;
  console.log("updateUrl", updateUrl);
  
  const dataString = `_method=patch&authenticity_token=BAhbB0kiAbB7ImNsaWVudF9pZCI6ImQ0NmY0NDgyY2UyNDRjNGEwNzYxYjA4ZTU3NzYxODJmYTlkMWM1Y2IiLCJleHBpcmVzX2F0IjoiMjAyNC0wMy0wNVQwNzo1Nzo1N1oiLCJ1c2VyX2lkcyI6WzQ4NjU5NjYwXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiYjZlYmU2NDA4NzdlMGE3NjA0YzAxYTMzNTgyOWIzMzQifQY6BkVUSXU6CVRpbWUNpwgfwM49n+cJOg1uYW5vX251bWkCJwM6DW5hbm9fZGVuaQY6DXN1Ym1pY3JvIgeAcDoJem9uZUkiCFVUQwY7AEY=--5cddc3a9858bb13da893f541971c35cef0becd0a&replace=true&todo[content]=${encodeURIComponent(
    todoContent
  )}&todo[due_on]=${endDate}&commit=Save+changes`;
  console.log("datastream",dataString);

  // Push each update promise into the array
  updatePromises.push(createUpdatePromise(updateUrl, dataString));
  try {
    const updateResponses = await Promise.all(updatePromises);
    // console.log('Update responses:', updateResponses);
    res.json({ success: true, message: 'Todos updated successfully' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// update handover date 
app.post('/handdate/:projectId/todos/:todoId', async (req, res) => {
  const projectId = req.params.projectId;
  const todoId = req.params.todoId;
  const endDate = req.body.todo.due_on;

  console.log("Update response:", projectId, todoId, endDate);
  const updatePromises = [];

  const createUpdatePromise = (url, data) => {
    return axios.patch(url, data, {
      headers: {
        'accept': 'application/json', 
        'accept-language': 'en-US,en;q=0.9', 
        'cookie': '_csrf_token=FS4NOcr6vfC%2BDQf9G7BMV58Jb3aUWCLOCHdK6kdQkLTYfGwDYoY6xPJFHL5qnNJ9xAYFITfl8Vn8vqjwPxS5DdfriFtqLcY%2B%2Be2OojGMpGN4dzMH9%2BOXvhoX3MkK2glGuYshPfDeV2qFkx4970RDQvM2l7gOtRHFdocVnY4QVzzUQEi5K%2FlU--T2EwleuEnJc7sTNR--aJFkgQmAjApDbBH0vziZAA%3D%3D; authenticity_token=Gk6nju-pN8wA554HOZfyhCIld6iHS6caYb0Y6JOCfYvC3OWlQVBDPoJFU5EhLWcBE9Uoaev-FD7ruwa7lPUoeQ; bc3_session=fUlDim6RMh19gcCVEz16jNLW4IbNER%2FEgkH8baDsvZ0H30vkqOlLm9QVMvMrYKBks5xbtN%2BHQzrkCO9BQAcodry0odlXqZlHniX8yO3gVF6%2BNSYXCi3TFZ%2Fon9vJuLOc6AgaLT5aukbdcC57UkivEAtbhTQ%2FKQp5k7jYQf8HcZiGxzh%2B0VCdKQJbAVgEMbvc8esL%2FMzfhWWRri6uYB51SiCZVgxEtewK86jIHUgCETZJJ3hHFm8ukTA0soLvjFwid4uZVk0u9uFNxwFsz3oC68hPKFZ5N5IYDcS4jia0vuLkKVbTZLKRPUJmCPZ4a32dZWIpJ8MwLotXBdrYBRp1GrMr--J3mjhASraNFoqAY6--qdZOPZXymNOWk5yrKFgZJg%3D%3D; color_scheme=none; bc3_identity_id=eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBCSnhpaVFFPSIsImV4cCI6bnVsbCwicHVyIjoiY29va2llLmJjM19pZGVudGl0eV9pZCJ9fQ%3D%3D--f46231e6c29714e20e9b764aab37715353e69919; bc3_session_verification_token=933a9031af17cd851767; bc3_session=dcoRWAWNruceza%2F%2FclIqHW%2BoZ16CY5R4TWPHKmFwVLc2E86kALFpXW%2FTrIAYIZC%2F%2B37L4%2BmgRa2%2BBkKP7xK2OLrqx3GJQJsisOk%2BA%2Bpj51LwJLKW%2BdXbEhIi8pWQTfoIR%2BJJvFS2XmtKHnqv6r034VRmncKnHuQ4RRH7AKwd4mHgmsWE2OPJtZvd67hY6bVBg%2BcqWy1UKYLC40I7f6fnattt8fFmAWy5zyLvsC1xpZYbY1sCmeORYLQrGKeVSGDTHjCKkXXDC4ASW2p4oINkS861GfXRFkRUnyXwzJ%2Bprl9c5cf9nePj%2BDLA53ZJaQbmlTjat5Sa%2F%2F5yNIp%2B8yr0ZUqu--%2F4abON9SJwguKOiy--flT7X9CHDTdtLp%2B8xcRF%2Bg%3D%3D', 
        'if-none-match': 'W/"173e513e7e1f8a152f2e9a9fa02624a8"', 
        'priority': 'u=1, i', 
        'referer': 'https://3.basecamp.com/5689409/projects', 
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"', 
        'sec-ch-ua-mobile': '?0', 
        'sec-ch-ua-platform': '"Windows"', 
        'sec-fetch-dest': 'empty', 
        'sec-fetch-mode': 'cors', 
        'sec-fetch-site': 'same-origin', 
        'sentry-trace': 'a88730a2e303406fbf785f0a7297edbd-acaffd8d1e102e43-0', 
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 
        'x-csrf-token': 'Gk6nju-pN8wA554HOZfyhCIld6iHS6caYb0Y6JOCfYvC3OWlQVBDPoJFU5EhLWcBE9Uoaev-FD7ruwa7lPUoeQ', 
        'x-fetch-type': 'native', 
        'x-requested-with': 'XMLHttpRequest'
      }
    });
  };

  const updateUrl = `https://3.basecamp.com/5689409/buckets/${projectId}/todos/${todoId}`;
  const dataString = `_method=patch&authenticity_token=BAhbB0kiAbB7ImNsaWVudF9pZCI6ImQ0NmY0NDgyY2UyNDRjNGEwNzYxYjA4ZTU3NzYxODJmYTlkMWM1Y2IiLCJleHBpcmVzX2F0IjoiMjAyNC0wNC0yOVQwODowOTozNVoiLCJ1c2VyX2lkcyI6WzQ4NjU5NjYwXSwidmVyc2lvbiI6MSwiYXBpX2RlYWRib2x0IjoiYjZlYmU2NDA4NzdlMGE3NjA0YzAxYTMzNTgyOWIzMzQifQY6BkVUSXU6CVRpbWUNqA8fwD0APiYJOg1uYW5vX251bWkXOg1uYW5vX2RlbmkGOg1zdWJtaWNybyIHAYA6CXpvbmVJIghVVEMGOwBG--33a3da6ff42efe99938a00072b831e2515afdddc&todo[due_on]=${endDate}&date=${endDate}&commit=Save+changes`;

  // Push each update promise into the array
  updatePromises.push(createUpdatePromise(updateUrl, dataString));

  try {
    const updateResponses = await Promise.all(updatePromises);
    // Access response data correctly
    const responseData = updateResponses.map(response => response.data);
    console.log('Update responses:', responseData.data);
    res.json({ success: true, message: 'Todos updated successfully' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

// delete the data like todo and duedate the entire row 
app.put('/5740649/buckets/:projectId/todos/:todoId', async (req, res) => {
  try {
    const projectId = req.params.projectId;
    // console.log("Project", projectId);
    const todoId = req.params.todoId;
    const todoContent = req.body.todo.content;
    const assignees = req.body.todo.assignees;
    const dueDate = req.body.todo.due_on;
    const startDate = req.body.todo.start_on;
    const dataString = `_method=patch&authenticity_token=${encodeURIComponent(authenticityToken)}&replace=true&todo[content]=${encodeURIComponent(
      todoContent
    )}&todo[assignees]=${assignees}&todo[completion_subscribers]=&todo[scheduling]=on&todo[starts_on]=${startDate}&date=${startDate}&todo[due_on]=${dueDate}&date=${dueDate}&date=&date=&todo[description]=&commit=Save+changes`;

    // Make the PATCH request to the Basecamp API to update the todo
    const deleteUrl = `${basecampApiUrl}/buckets/${projectId}/recordings/${todoId}/status/trashed`;
    const updateResponse = await axios.put(
      deleteUrl,
      dataString,
      headers = {
        'accept': 'application/json', 
        'accept-language': 'en-US,en;q=0.9', 
        'cookie': '_csrf_token=FS4NOcr6vfC%2BDQf9G7BMV58Jb3aUWCLOCHdK6kdQkLTYfGwDYoY6xPJFHL5qnNJ9xAYFITfl8Vn8vqjwPxS5DdfriFtqLcY%2B%2Be2OojGMpGN4dzMH9%2BOXvhoX3MkK2glGuYshPfDeV2qFkx4970RDQvM2l7gOtRHFdocVnY4QVzzUQEi5K%2FlU--T2EwleuEnJc7sTNR--aJFkgQmAjApDbBH0vziZAA%3D%3D; authenticity_token=Gk6nju-pN8wA554HOZfyhCIld6iHS6caYb0Y6JOCfYvC3OWlQVBDPoJFU5EhLWcBE9Uoaev-FD7ruwa7lPUoeQ; bc3_session=fUlDim6RMh19gcCVEz16jNLW4IbNER%2FEgkH8baDsvZ0H30vkqOlLm9QVMvMrYKBks5xbtN%2BHQzrkCO9BQAcodry0odlXqZlHniX8yO3gVF6%2BNSYXCi3TFZ%2Fon9vJuLOc6AgaLT5aukbdcC57UkivEAtbhTQ%2FKQp5k7jYQf8HcZiGxzh%2B0VCdKQJbAVgEMbvc8esL%2FMzfhWWRri6uYB51SiCZVgxEtewK86jIHUgCETZJJ3hHFm8ukTA0soLvjFwid4uZVk0u9uFNxwFsz3oC68hPKFZ5N5IYDcS4jia0vuLkKVbTZLKRPUJmCPZ4a32dZWIpJ8MwLotXBdrYBRp1GrMr--J3mjhASraNFoqAY6--qdZOPZXymNOWk5yrKFgZJg%3D%3D; color_scheme=none; bc3_identity_id=eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBCSnhpaVFFPSIsImV4cCI6bnVsbCwicHVyIjoiY29va2llLmJjM19pZGVudGl0eV9pZCJ9fQ%3D%3D--f46231e6c29714e20e9b764aab37715353e69919; bc3_session_verification_token=933a9031af17cd851767; bc3_session=dcoRWAWNruceza%2F%2FclIqHW%2BoZ16CY5R4TWPHKmFwVLc2E86kALFpXW%2FTrIAYIZC%2F%2B37L4%2BmgRa2%2BBkKP7xK2OLrqx3GJQJsisOk%2BA%2Bpj51LwJLKW%2BdXbEhIi8pWQTfoIR%2BJJvFS2XmtKHnqv6r034VRmncKnHuQ4RRH7AKwd4mHgmsWE2OPJtZvd67hY6bVBg%2BcqWy1UKYLC40I7f6fnattt8fFmAWy5zyLvsC1xpZYbY1sCmeORYLQrGKeVSGDTHjCKkXXDC4ASW2p4oINkS861GfXRFkRUnyXwzJ%2Bprl9c5cf9nePj%2BDLA53ZJaQbmlTjat5Sa%2F%2F5yNIp%2B8yr0ZUqu--%2F4abON9SJwguKOiy--flT7X9CHDTdtLp%2B8xcRF%2Bg%3D%3D', 
        'if-none-match': 'W/"173e513e7e1f8a152f2e9a9fa02624a8"', 
        'priority': 'u=1, i', 
        'referer': 'https://3.basecamp.com/5689409/projects', 
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"', 
        'sec-ch-ua-mobile': '?0', 
        'sec-ch-ua-platform': '"Windows"', 
        'sec-fetch-dest': 'empty', 
        'sec-fetch-mode': 'cors', 
        'sec-fetch-site': 'same-origin', 
        'sentry-trace': 'a88730a2e303406fbf785f0a7297edbd-acaffd8d1e102e43-0', 
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 
        'x-csrf-token': 'Gk6nju-pN8wA554HOZfyhCIld6iHS6caYb0Y6JOCfYvC3OWlQVBDPoJFU5EhLWcBE9Uoaev-FD7ruwa7lPUoeQ', 
        'x-fetch-type': 'native', 
        'x-requested-with': 'XMLHttpRequest'
      },
      {});
    // console.log('Update response:', updateResponse.data);
    res.json({ success: true, message: 'Todo updated successfully' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).send('Internal Server Error');
  }
});


// API endpoint to complete a todo
app.post('/completeTodo/:projectId/:todoId', async (req, res) => {
  const projectId = req.params.projectId;
  console.log("Project", projectId);
  const todoId = req.params.todoId;
  const basecampApiUrl = `https://3.basecamp.com/5689409/buckets/${projectId}/todos/${todoId}/completion?replace=false`;

  try {
    // Make a POST request to the Basecamp API to mark the todo as completed
    const response = await axios.post(basecampApiUrl, null, {
      headers: {
        'accept': 'application/json', 
        'accept-language': 'en-US,en;q=0.9', 
        'cookie': '_csrf_token=FS4NOcr6vfC%2BDQf9G7BMV58Jb3aUWCLOCHdK6kdQkLTYfGwDYoY6xPJFHL5qnNJ9xAYFITfl8Vn8vqjwPxS5DdfriFtqLcY%2B%2Be2OojGMpGN4dzMH9%2BOXvhoX3MkK2glGuYshPfDeV2qFkx4970RDQvM2l7gOtRHFdocVnY4QVzzUQEi5K%2FlU--T2EwleuEnJc7sTNR--aJFkgQmAjApDbBH0vziZAA%3D%3D; authenticity_token=Gk6nju-pN8wA554HOZfyhCIld6iHS6caYb0Y6JOCfYvC3OWlQVBDPoJFU5EhLWcBE9Uoaev-FD7ruwa7lPUoeQ; bc3_session=fUlDim6RMh19gcCVEz16jNLW4IbNER%2FEgkH8baDsvZ0H30vkqOlLm9QVMvMrYKBks5xbtN%2BHQzrkCO9BQAcodry0odlXqZlHniX8yO3gVF6%2BNSYXCi3TFZ%2Fon9vJuLOc6AgaLT5aukbdcC57UkivEAtbhTQ%2FKQp5k7jYQf8HcZiGxzh%2B0VCdKQJbAVgEMbvc8esL%2FMzfhWWRri6uYB51SiCZVgxEtewK86jIHUgCETZJJ3hHFm8ukTA0soLvjFwid4uZVk0u9uFNxwFsz3oC68hPKFZ5N5IYDcS4jia0vuLkKVbTZLKRPUJmCPZ4a32dZWIpJ8MwLotXBdrYBRp1GrMr--J3mjhASraNFoqAY6--qdZOPZXymNOWk5yrKFgZJg%3D%3D; color_scheme=none; bc3_identity_id=eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBCSnhpaVFFPSIsImV4cCI6bnVsbCwicHVyIjoiY29va2llLmJjM19pZGVudGl0eV9pZCJ9fQ%3D%3D--f46231e6c29714e20e9b764aab37715353e69919; bc3_session_verification_token=933a9031af17cd851767; bc3_session=dcoRWAWNruceza%2F%2FclIqHW%2BoZ16CY5R4TWPHKmFwVLc2E86kALFpXW%2FTrIAYIZC%2F%2B37L4%2BmgRa2%2BBkKP7xK2OLrqx3GJQJsisOk%2BA%2Bpj51LwJLKW%2BdXbEhIi8pWQTfoIR%2BJJvFS2XmtKHnqv6r034VRmncKnHuQ4RRH7AKwd4mHgmsWE2OPJtZvd67hY6bVBg%2BcqWy1UKYLC40I7f6fnattt8fFmAWy5zyLvsC1xpZYbY1sCmeORYLQrGKeVSGDTHjCKkXXDC4ASW2p4oINkS861GfXRFkRUnyXwzJ%2Bprl9c5cf9nePj%2BDLA53ZJaQbmlTjat5Sa%2F%2F5yNIp%2B8yr0ZUqu--%2F4abON9SJwguKOiy--flT7X9CHDTdtLp%2B8xcRF%2Bg%3D%3D', 
        'if-none-match': 'W/"173e513e7e1f8a152f2e9a9fa02624a8"', 
        'priority': 'u=1, i', 
        'referer': 'https://3.basecamp.com/5689409/projects', 
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"', 
        'sec-ch-ua-mobile': '?0', 
        'sec-ch-ua-platform': '"Windows"', 
        'sec-fetch-dest': 'empty', 
        'sec-fetch-mode': 'cors', 
        'sec-fetch-site': 'same-origin', 
        'sentry-trace': 'a88730a2e303406fbf785f0a7297edbd-acaffd8d1e102e43-0', 
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 
        'x-csrf-token': 'Gk6nju-pN8wA554HOZfyhCIld6iHS6caYb0Y6JOCfYvC3OWlQVBDPoJFU5EhLWcBE9Uoaev-FD7ruwa7lPUoeQ', 
        'x-fetch-type': 'native', 
        'x-requested-with': 'XMLHttpRequest'
      }
    });

    console.log(`Todo with ID ${todoId} marked as completed.`);
    res.sendStatus(204); 
  } catch (error) {
    console.error('Error completing todo:', error);
    res.status(500).send('Error completing todo'); 
  }
});


// API endpoint to uncomplete a todo
app.delete('/uncompleteTodo/:projectId/:todoId', async (req, res) => {
  const todoId = req.params.todoId;
  const projectId = req.params.projectId;
  console.log("Project", projectId);
  const basecampApiUrl = `https://3.basecamp.com/5689409/buckets/${projectId}/todos/${todoId}/completion?replace=false`;

  try {
    // Make a DELETE request to the Basecamp API to mark the todo as uncompleted
    const response = await axios.delete(basecampApiUrl, {
      headers: {
        'accept': 'application/json', 
        'accept-language': 'en-US,en;q=0.9', 
        'cookie': '_csrf_token=FS4NOcr6vfC%2BDQf9G7BMV58Jb3aUWCLOCHdK6kdQkLTYfGwDYoY6xPJFHL5qnNJ9xAYFITfl8Vn8vqjwPxS5DdfriFtqLcY%2B%2Be2OojGMpGN4dzMH9%2BOXvhoX3MkK2glGuYshPfDeV2qFkx4970RDQvM2l7gOtRHFdocVnY4QVzzUQEi5K%2FlU--T2EwleuEnJc7sTNR--aJFkgQmAjApDbBH0vziZAA%3D%3D; authenticity_token=Gk6nju-pN8wA554HOZfyhCIld6iHS6caYb0Y6JOCfYvC3OWlQVBDPoJFU5EhLWcBE9Uoaev-FD7ruwa7lPUoeQ; bc3_session=fUlDim6RMh19gcCVEz16jNLW4IbNER%2FEgkH8baDsvZ0H30vkqOlLm9QVMvMrYKBks5xbtN%2BHQzrkCO9BQAcodry0odlXqZlHniX8yO3gVF6%2BNSYXCi3TFZ%2Fon9vJuLOc6AgaLT5aukbdcC57UkivEAtbhTQ%2FKQp5k7jYQf8HcZiGxzh%2B0VCdKQJbAVgEMbvc8esL%2FMzfhWWRri6uYB51SiCZVgxEtewK86jIHUgCETZJJ3hHFm8ukTA0soLvjFwid4uZVk0u9uFNxwFsz3oC68hPKFZ5N5IYDcS4jia0vuLkKVbTZLKRPUJmCPZ4a32dZWIpJ8MwLotXBdrYBRp1GrMr--J3mjhASraNFoqAY6--qdZOPZXymNOWk5yrKFgZJg%3D%3D; color_scheme=none; bc3_identity_id=eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBCSnhpaVFFPSIsImV4cCI6bnVsbCwicHVyIjoiY29va2llLmJjM19pZGVudGl0eV9pZCJ9fQ%3D%3D--f46231e6c29714e20e9b764aab37715353e69919; bc3_session_verification_token=933a9031af17cd851767; bc3_session=dcoRWAWNruceza%2F%2FclIqHW%2BoZ16CY5R4TWPHKmFwVLc2E86kALFpXW%2FTrIAYIZC%2F%2B37L4%2BmgRa2%2BBkKP7xK2OLrqx3GJQJsisOk%2BA%2Bpj51LwJLKW%2BdXbEhIi8pWQTfoIR%2BJJvFS2XmtKHnqv6r034VRmncKnHuQ4RRH7AKwd4mHgmsWE2OPJtZvd67hY6bVBg%2BcqWy1UKYLC40I7f6fnattt8fFmAWy5zyLvsC1xpZYbY1sCmeORYLQrGKeVSGDTHjCKkXXDC4ASW2p4oINkS861GfXRFkRUnyXwzJ%2Bprl9c5cf9nePj%2BDLA53ZJaQbmlTjat5Sa%2F%2F5yNIp%2B8yr0ZUqu--%2F4abON9SJwguKOiy--flT7X9CHDTdtLp%2B8xcRF%2Bg%3D%3D', 
        'if-none-match': 'W/"173e513e7e1f8a152f2e9a9fa02624a8"', 
        'priority': 'u=1, i', 
        'referer': 'https://3.basecamp.com/5689409/projects', 
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"', 
        'sec-ch-ua-mobile': '?0', 
        'sec-ch-ua-platform': '"Windows"', 
        'sec-fetch-dest': 'empty', 
        'sec-fetch-mode': 'cors', 
        'sec-fetch-site': 'same-origin', 
        'sentry-trace': 'a88730a2e303406fbf785f0a7297edbd-acaffd8d1e102e43-0', 
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', 
        'x-csrf-token': 'Gk6nju-pN8wA554HOZfyhCIld6iHS6caYb0Y6JOCfYvC3OWlQVBDPoJFU5EhLWcBE9Uoaev-FD7ruwa7lPUoeQ', 
        'x-fetch-type': 'native', 
        'x-requested-with': 'XMLHttpRequest'
      }
    });

    console.log(`Todo with ID ${todoId} marked as uncompleted.`);
    res.sendStatus(204); 
  } catch (error) {
    console.error('Error uncompleting todo:', error);
    res.status(500).send('Error uncompleting todo'); 
  }
});

async function fetchLogs() {
  const logs = [];
  const totalPages = 10;
  const keywords = ['Critical', 'Pre-Requisites', 'Installation', 'Handover', 'Commissioning'];

  for (let page = 1; page <= totalPages; page++) {
    try {
      // Fetch progress logs for the current page
      const response = await axios.get(`${basecampApiUrl}/reports/progress.json?page=${page}`, axiosConfig);
      const logData = response.data;

      if (!logData || logData.length === 0) break; // Exit loop if no data

      // Filter logs early based on `app_url` and keywords
      const validLogs = logData.filter(log => {
        const appUrl = log.app_url || '';
        const targetContent = log.target?.toLowerCase() || '';

        const isValidAppUrl = appUrl.includes('/todos/');
        const matchesKeyword = keywords.some(keyword => targetContent.includes(keyword.toLowerCase()));

        return isValidAppUrl && matchesKeyword;
      });

      // Process logs concurrently using Promise.all
      const processedLogs = await Promise.all(
        validLogs.map(async (log) => {
          try {
            const jsonUrl = log.app_url.replace('/todos/', '/todos/').concat('.json');
            const todoResponse = await axios.get(jsonUrl, axiosConfig);
            const todoData = todoResponse.data;

            if (todoData.parent?.url) {
              const parentResponse = await axios.get(todoData.parent.url, axiosConfig);
              log.parentTitle = parentResponse.data.title || 'No Title Available';
            } else {
              log.parentTitle = 'Parent URL Missing';
            }

            return log;
          } catch (innerError) {
            console.error('Error processing log:', innerError.message);
            log.parentTitle = 'Error fetching parent title';
            return log; // Return the log even if parent fetch fails
          }
        })
      );

      // Add the processed logs to the main logs array
      logs.push(...processedLogs);
    } catch (error) {
      console.error(`Error fetching logs for page ${page}:`, error.message);
      break; // Exit loop on error
    }
  }

  return logs;
}

// Route handler to render the logs page
// app.get('/logs', async (req, res) => {
//   try {
//     const logs = await fetchLogs(); 
//     res.render('logs', { logs });      
//   } catch (error) {
//     console.error('Error fetching logs for rendering:', error.message);
//     res.status(500).send('Error fetching logs');
//   }
// });

// app.get('/logs', async (req, res) => {
//   try {
//     // If this is an AJAX call for DataTable data
//     if (req.xhr) {
//       const { draw, start = 0, length = 10, search } = req.query;

//       // Fetch logs from your database or data source
//       const logs = await fetchLogs();
//       console.log("Fetched logs:", logs); // Log fetched logs to see if data is there

//       // Define the phrases to look for
//       const phrases = ['added', 'changed', 'commented', 'started', 'checked off', 'reposted', 'moved', 'replaced'];

//       // Function to generate displayTitle based on the title
//       function getDisplayTitle(title) {
//         let foundPhrase = '';
//         for (const phrase of phrases) {
//           const regex = new RegExp(phrase, 'i'); // Case-insensitive match
//           if (regex.test(title)) {
//             foundPhrase = phrase;
//             break; // Stop checking once we find the first matching phrase
//           }
//         }
//         return foundPhrase ? foundPhrase : title;
//       }

//       // Apply displayTitle to each log
//       const logsWithDisplayTitle = logs.map(log => ({
//         ...log,
//         displayTitle: getDisplayTitle(log.title) // Add the displayTitle property
//       }));

//       // Apply search filter
//       let filteredLogs = logsWithDisplayTitle;
//       if (search?.value) {
//         filteredLogs = logsWithDisplayTitle.filter(log =>
//           log.title.toLowerCase().includes(search.value.toLowerCase())
//         );
//       }

//       // Apply pagination
//       const paginatedLogs = filteredLogs.slice(start, parseInt(start, 10) + parseInt(length, 10));
//       console.log(paginatedLogs.length);

//       // Send JSON response for DataTable
//       return res.json({
//         draw: parseInt(draw, 10),
//         recordsTotal: logs.length, // Total records without filtering
//         recordsFiltered: filteredLogs.length, // Filtered records (after applying search)
//         data: paginatedLogs, // Paginated data for the current page
//       });
//     }

//     // If this is a page render request
//     res.render('logs'); // Render logs page
//   } catch (error) {
//     console.error('Error fetching logs:', error.message);
//     res.status(500).send('Error fetching logs');
//   }
// });

// app.get('/logs', async (req, res) => {
//   try {
//     // If this is an AJAX call for DataTable data (pagination request)
//     if (req.xhr) {
//       const { draw, start = 0, length = 10, search } = req.query;

//       // Fetch logs from your database or data source
//       const logs = await fetchLogs();

//       // Define the phrases to look for
//       const phrases = ['added', 'changed', 'commented', 'started', 'checked off', 'reposted', 'moved', 'replaced'];

//       // Function to generate displayTitle based on the title
//       function getDisplayTitle(title) {
//         let foundPhrase = '';
//         for (const phrase of phrases) {
//           const regex = new RegExp(phrase, 'i'); // Case-insensitive match
//           if (regex.test(title)) {
//             foundPhrase = phrase;
//             break; // Stop checking once we find the first matching phrase
//           }
//         }
//         return foundPhrase ? foundPhrase : title;
//       }

//       // Apply displayTitle to each log
//       const logsWithDisplayTitle = logs.map(log => ({
//         ...log,
//         displayTitle: getDisplayTitle(log.title) // Add the displayTitle property
//       }));

//       // Apply search filter
//       let filteredLogs = logsWithDisplayTitle;
//       if (search?.value) {
//         filteredLogs = logsWithDisplayTitle.filter(log =>{
//           const searchString = search.value.toLowerCase();
//           return log.title.toLowerCase().includes(searchString) ||
//                  log.creator.name.toLowerCase().includes(searchString) ||
//                  log.bucket.name.toLowerCase().includes(searchString) ||
//                  log.parentTitle.toLowerCase().includes(searchString) ||
//                  log.target.toLowerCase().includes(searchString) ||
//                  log.summary_excerpt.toLowerCase().includes(searchString);
//         });
      
//       }

//       // Apply pagination
//       const paginatedLogs = filteredLogs.slice(start, parseInt(start, 10) + parseInt(length, 10));

//       // Send JSON response for DataTable
//       return res.json({
//         draw: parseInt(draw, 10),
//         recordsTotal: logs.length, // Total records without filtering
//         recordsFiltered: filteredLogs.length, // Filtered records (after applying search)
//         data: paginatedLogs, // Paginated data for the current page
//       });
//     }

//     // If this is a request for exporting logs (no pagination)
//     if (req.query.export) {
//       const logs = await fetchLogs(); // Fetch all logs from your data source

//       // Define the phrases to look for
//       const phrases = ['added', 'changed', 'commented', 'started', 'checked off', 'reposted', 'moved', 'replaced'];

//       // Function to generate displayTitle based on the title
//       function getDisplayTitle(title) {
//         let foundPhrase = '';
//         for (const phrase of phrases) {
//           const regex = new RegExp(phrase, 'i');
//           if (regex.test(title)) {
//             foundPhrase = phrase;
//             break;
//           }
//         }
//         return foundPhrase ? foundPhrase : title;
//       }

//       // Apply displayTitle to each log
//       const logsWithDisplayTitle = logs.map(log => ({
//         ...log,
//         displayTitle: getDisplayTitle(log.title)
//       }));

//       // Send the logs as JSON for export
//       return res.json(logsWithDisplayTitle);
//     }

//     // If this is a page render request
//     // res.render('logs'); // Render the logs page
//     res.sendFile(path.join(__dirname, 'views', 'logs.html')); // Make sure the path is correct

//   } catch (error) {
//     console.error('Error fetching logs:', error.message);
//     res.status(500).send('Error fetching logs');
//   }
// });

// app.get('/logs', async (req, res) => {
//   try {
//     // If this is an AJAX call for DataTable data (pagination request)
//     if (req.xhr) {
//       const { draw, start = 0, length = 10, search, filter, startDate, endDate, filterType, columns } = req.query;

//       // Fetch logs from your database or data source
//       let logs = await fetchLogs();

//       // Apply date range filter (if provided)
//       if (startDate && endDate) {
//         logs = logs.filter(log => {
//           const logDate = new Date(log.created_at);
//           return logDate >= new Date(startDate) && logDate <= new Date(endDate);
//         });
//       }
//       // Apply filterType for specific options
//       if (filterType === 'checked_off_hardware') {
//         logs = logs.filter(log => {
//           const activity = log.title.toLowerCase();
//           const comment = log.summary_excerpt?.toLowerCase() || '';
//           const isCheckedOff = activity.includes('checked off');
//           const isHardwareInstallation = activity.includes('hardware installation') || comment.includes('hardware installation');
//           return isCheckedOff && isHardwareInstallation;
//         });
//       }
//       if (columns) {
//         columns.forEach((col, index) => {
//             if (col.search && col.search.value) {
//                 const searchValue = col.search.value.toLowerCase();
//                 logs = logs.filter(log => {
//                     switch (index) {
//                         case 0: return log.bucket.name.toLowerCase().includes(searchValue);
//                         case 1: return log.creator.name.toLowerCase().includes(searchValue);
//                         case 2: return new Date(log.created_at).toISOString().includes(searchValue);
//                         case 3: return log.displayTitle.toLowerCase().includes(searchValue);
//                         case 4: return log.parentTitle.toLowerCase().includes(searchValue);
//                         case 5: return log.target.toLowerCase().includes(searchValue);
//                         case 6: return log.summary_excerpt?.toLowerCase().includes(searchValue);
//                         default: return true;
//                     }
//                 });
//             }
//         });
//     }
    
//       // Apply search filter (if provided)
//       if (search?.value) {
//         logs = logs.filter(log =>
//           log.title.toLowerCase().includes(search.value.toLowerCase()) ||
//           log.creator.name.toLowerCase().includes(search.value.toLowerCase()) ||
//           log.bucket.name.toLowerCase().includes(search.value.toLowerCase()) ||
//           log.parentTitle.toLowerCase().includes(search.value.toLowerCase()) ||
//           log.target.toLowerCase().includes(search.value.toLowerCase()) ||
//           log.summary_excerpt.toLowerCase().includes(search.value.toLowerCase())
//         );
//       }

//       // Define the phrases to look for (for displayTitle)
//       const phrases = ['added', 'changed', 'commented', 'started', 'checked off', 'reposted', 'moved', 'replaced'];

//       // Function to generate displayTitle based on the title
//       function getDisplayTitle(title) {
//         let foundPhrase = '';
//         for (const phrase of phrases) {
//           const regex = new RegExp(phrase, 'i');
//           if (regex.test(title)) {
//             foundPhrase = phrase;
//             break;
//           }
//         }
//         return foundPhrase ? foundPhrase : title;
//       }

//       // Apply displayTitle to each log
//       const logsWithDisplayTitle = logs.map(log => ({
//         ...log,
//         displayTitle: getDisplayTitle(log.title)
//       }));

//       // Apply pagination
//       const paginatedLogs = logsWithDisplayTitle.slice(start, parseInt(start, 10) + parseInt(length, 10));

//       // Send JSON response for DataTable
//       return res.json({
//         draw: parseInt(draw, 10),
//         recordsTotal: logs.length, // Total records without filtering
//         recordsFiltered: logs.length, // Filtered records (after applying search and date filters)
//         data: paginatedLogs, // Paginated data for the current page
//       });
//     }

//     // Handle non-pagination requests (export or other routes)
//     res.sendFile(path.join(__dirname, 'views', 'logs.html'));

//   } catch (error) {
//     console.error('Error fetching logs:', error.message);
//     res.status(500).send('Error fetching logs');
//   }
// });
app.get('/logs', async (req, res) => {
  try {
    if (req.xhr) {
      const { draw, start = 0, length = 10, search, filter, startDate, endDate, filterType, columns } = req.query;

      // Fetch logs from your database or data source 
      let logs = await fetchLogs();

      // Define the phrases to look for (for displayTitle)
      const phrases = ['added', 'changed', 'commented', 'started', 'checked off', 'reposted', 'moved', 'replaced'];

      // Function to generate displayTitle based on the title
      function getDisplayTitle(title) {
        let foundPhrase = '';
        for (const phrase of phrases) {
          const regex = new RegExp(phrase, 'i');
          if (regex.test(title)) {
            foundPhrase = phrase;
            break;
          }
        }
        return foundPhrase ? foundPhrase : title;
      }

      // Apply displayTitle to each log
      logs = logs.map(log => ({
        ...log,
        displayTitle: getDisplayTitle(log.title),
      }));

      // Apply date range filter (if provided)
      if (startDate && endDate) {
        logs = logs.filter(log => {
          const logDate = new Date(log.created_at);
          return logDate >= new Date(startDate) && logDate <= new Date(endDate);
        });
      }

      // Apply filterType for specific options
      if (filterType === 'checked_off_hardware') {
        logs = logs.filter(log => {
          const activity = log.title.toLowerCase();
          const comment = log.summary_excerpt?.toLowerCase() || '';
          const isCheckedOff = activity.includes('checked off');
          const isHardwareInstallation = activity.includes('hardware installation') || comment.includes('hardware installation');
          return isCheckedOff && isHardwareInstallation;
        });
      }

      // Apply column-based filtering
      if (columns) {
        columns.forEach((col, index) => {
          if (col.search && col.search.value) {
            const searchValue = col.search.value.toLowerCase();
            logs = logs.filter(log => {
              switch (index) {
                case 0: return log.bucket?.name?.toLowerCase().includes(searchValue);
                case 1: return log.creator?.name?.toLowerCase().includes(searchValue);
                case 2: return new Date(log.created_at).toLocaleDateString().toLowerCase().includes(searchValue);
                case 3: 
                  return log.displayTitle?.toLowerCase().includes(searchValue);
                case 4: return log.parentTitle?.toLowerCase().includes(searchValue);
                case 5: return log.target?.toLowerCase().includes(searchValue);
                case 6: return log.summary_excerpt?.toLowerCase().includes(searchValue);
                default: return true;
              }
            });
          }
        });
      }

      // Apply global search filter (if provided)
      if (search?.value) {
        const searchValue = search.value.toLowerCase();
        logs = logs.filter(log =>
          log.title.toLowerCase().includes(searchValue) ||
          log.creator?.name?.toLowerCase().includes(searchValue) ||
          log.bucket?.name?.toLowerCase().includes(searchValue) ||
          log.parentTitle?.toLowerCase().includes(searchValue) ||
          log.target?.toLowerCase().includes(searchValue) ||
          log.summary_excerpt?.toLowerCase().includes(searchValue) ||
          log.displayTitle?.toLowerCase().includes(searchValue)
        );
      }

      // Apply pagination
      const paginatedLogs = logs.slice(parseInt(start, 10), parseInt(start, 10) + parseInt(length, 10));

      // Send JSON response for DataTable
      return res.json({
        draw: parseInt(draw, 10),
        recordsTotal: logs.length, // Total records without filtering
        recordsFiltered: logs.length, // Filtered records (after applying search and date filters)
        data: paginatedLogs, // Paginated data for the current page
      });
    }

    // Handle non-pagination requests (export or other routes)
    res.sendFile(path.join(__dirname, 'views', 'logs.html'));

  } catch (error) {
    console.error('Error fetching logs:', error.message);
    res.status(500).send('Error fetching logs');
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
